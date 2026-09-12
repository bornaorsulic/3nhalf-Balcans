# Hosting it on Nebius

Everything on Nebius: Managed PostgreSQL for the data, one Compute VM running the
backend and frontend in Docker, and a Nebius tunnel for the public HTTPS URL — so you
need no domain, no public IP and no certificate.

```txt
                              ┌────────────────────────────────────┐
 https://web-….tunnel.        │  Compute VM                        │
 applications.….nebius.cloud  │                                    │
            │                 │   tunnel agent (systemd)           │
            └────────────────▶│        │                           │
                              │        ▼ :8080                     │
                              │   caddy ──┬──▶ frontend :3000      │
                              │           └──▶ backend  :8000      │
                              └───────────────────┬────────────────┘
                                                  │ private network
                              ┌───────────────────▼────────────────┐
                              │  Managed PostgreSQL                │
                              └────────────────────────────────────┘
```

**One origin, deliberately.** Caddy serves the app at `/` and the API at `/api/`, so the
browser only ever talks to one hostname. Sessions are HttpOnly cookies and the API runs
CORS with credentials: split across two hostnames, Safari and Chrome treat the cookie as
third-party and block it, and login fails for some visitors with nothing in the console
to explain it. It also means `NEXT_PUBLIC_API_BASE_URL` is the relative `/api/v1`, which
matters because that value is **baked into the client bundle at build time** — a wrong
absolute URL is a rebuild, not a restart.

## Before you start

- A Nebius project in a region with Managed PostgreSQL — `eu-north1` works. It is not
  available in `eu-north2`, `us-north1` or `uk-south2`.
- The CLI:

  ```bash
  curl -sSL https://storage.eu-north1.nebius.cloud/cli/install.sh | bash
  nebius init
  ```

## 1. Managed PostgreSQL

Create a cluster in the console, then **create a database called `health_agent`** on it
(managed clusters usually do not let you `CREATE DATABASE` over the wire — the setup
script knows this and only creates tables when `DATABASE_URL` is set).

Set **Access** to **Private only** — the VM reaches it over the VPC, and the tunnel is
what makes the *app* public. A managed database on the open internet is the one mistake
here that actually costs something.

The cluster page's **"How to connect"** dialog has the host, the port and the CA
download. The host looks like
`private-rw.postgresql-<id>.backbone-<id>.msp.<region>.nebius.cloud`.

⚠️ **Pick a password without URL syntax in it** — no `@ : / ? # [ ] & %`. It goes into a
connection string, and an `@` produces a parse error that reads like an auth failure.

The certificate comes from a private Nebius CA, so `sslmode=verify-full` needs it on
disk. On the VM (step 2), once you are in:

```bash
mkdir -p /opt/longevity/certs
curl -fsS https://storage.eu-north1.nebius.cloud/msp-certs/ca.pem -o /opt/longevity/certs/ca.pem
```

Compose mounts it into the backend at `/etc/ssl/nebius/ca.pem`, so the connection string
is

```txt
postgresql://<user>:<password>@<host>:5432/health_agent?sslmode=verify-full&sslrootcert=/etc/ssl/nebius/ca.pem
```

Check it with `openssl s_client -starttls postgres -connect <host>:5432 -CAfile
/opt/longevity/certs/ca.pem` — you want `Verify return code: 0 (ok)`.

Put the cluster in the **same VPC network** as the VM from step 2.

## 2. The VM

A small general-purpose VM is enough — this is two Node/Python processes, not a model.
No GPU, no public IP: the tunnel agent dials out.

```bash
nebius compute instance create --parent-id "$NEBIUS_PROJECT_ID" \
  --name longevity --preset-name cpu-d3 \
  --boot-disk-size-gibibytes 40 \
  --network-interfaces '[{"name":"eth0","subnet_id":"<subnet-id>"}]'
```

Then SSH in and install Docker:

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker "$USER" && newgrp docker
```

## 3. The app

```bash
sudo mkdir -p /opt/longevity && sudo chown "$USER" /opt/longevity
git clone <this repo> /opt/longevity/app
cd /opt/longevity/app/deploy
cp .env.example .env
```

Fill in `DATABASE_URL`. Leave `PUBLIC_URL` for now — you get it in step 5, and the
backend needs a value to start, so put the placeholder there and correct it later.

```bash
docker compose up -d --build
curl -s -o /dev/null -w '%{http_code}\n' localhost:8080/login   # expect 200
```

The first build takes a few minutes: it installs npm dependencies and builds the
frontend inside the image.

## 4. Seed the database

```bash
./seed.sh
```

Schema, the demo patient, and the demo accounts — the same four steps as the README, run
inside the backend container. Safe to re-run: it replaces those rows rather than
duplicating them. `data/patient_demo.json` is committed, so nothing needs Node here; to
refresh the demo dates, run `npm run export:demo` on your machine and commit the file.

## 5. The public URL

Create the tunnel and a service account for the agent:

```bash
export TUNNEL_ID=$(nebius tunnel create --title longevity --format jsonpath='{.metadata.id}')

nebius iam service-account create --name longevity-tunnel
openssl genrsa -out /opt/longevity/private_key.pem 4096
openssl rsa -in /opt/longevity/private_key.pem -pubout -out /opt/longevity/public_key.pem
nebius iam auth-public-key create --service-account-id <sa-id> --data "$(cat /opt/longevity/public_key.pem)"
```

Give that service account the `applicationtunnel.agent` role **on the tunnel**, then
install the agent on the VM:

```bash
cd /opt/longevity
curl -LO https://storage.eu-north1.nebius.cloud/products/releases/nebius-tunnel-agent/latest/nebius-tunnel-agent-linux-x86_64.tar.gz
tar -xzf nebius-tunnel-agent-linux-x86_64.tar.gz
cp app/deploy/tunnel-agent.example.yaml tunnel-agent.yaml   # fill in the three ids
sudo cp app/deploy/nebius-tunnel-agent.service /etc/systemd/system/
sudo systemctl enable --now nebius-tunnel-agent
```

The agent prints the public URL, in the form

```txt
https://web-<masked-tunnel-id>.tunnel.applications.eu-north1.nebius.cloud
```

Put it in `deploy/.env` as `PUBLIC_URL` — exact scheme, no trailing slash — and restart
the backend so CORS and the Secure cookie flag match:

```bash
cd /opt/longevity/app/deploy && docker compose up -d backend
```

Open the URL and sign in.

## Redeploying

```bash
cd /opt/longevity/app && git pull && cd deploy && docker compose up -d --build
```

The database is untouched by this; only re-run `./seed.sh` when the schema changed.

## Instead of a tunnel: your own domain

If you would rather have a real hostname, give the VM a public IP, point an A record at
it, open 80 and 443, and let Caddy get the certificate:

1. In `deploy/Caddyfile`, delete the `auto_https off` line and replace `:8080` with your
   domain.
2. In `docker-compose.yml`, change the proxy's ports to `"80:80"` and `"443:443"`.
3. Set `PUBLIC_URL` to `https://your-domain`.

Everything else is the same.

## Before you share the URL

The demo logins are `demo1234` and the doctor invite code is `LONGEVITY-2026`. That is
fine on localhost and not fine on a public address. Either keep the URL private, or
change them — the passwords via the profile page, the invite code in
`scripts/seed_accounts.py`.

There is no patient data in here that belongs to a real person, and it should stay that
way: this is a demo, not a system anyone should put a real record into.

## When something does not work

| Symptom | Cause |
|---|---|
| Login does nothing, no error | `PUBLIC_URL` does not match the URL in the address bar, so the cookie is rejected. It must match scheme and host exactly. |
| The API answers, the app shows loading forever | The frontend was built with a different `NEXT_PUBLIC_API_BASE_URL`. Rebuild — it is compiled in, not read at runtime. |
| The backend container hangs at startup | `DATABASE_URL` is missing, so the script is waiting for a password on a terminal that is not there. |
| `certificate verify failed` | The CA is not mounted, or `sslrootcert` does not point at `/etc/ssl/nebius/ca.pem` (the path *inside* the container). |
| `relation "users" does not exist` | Step 4 was not run. |
| The tunnel URL 502s | Caddy is not up, or the agent is pointed at the wrong port: it must be `localhost:8080`. |
