"use client";

import useSWR, { type SWRConfiguration } from "swr";
import { getApi } from ".";

/*
 * Data hooks. SWR caches per key, so switching tabs shows data instantly and
 * mutations only need to call `mutate()` on the affected hook.
 */

const options: SWRConfiguration = { revalidateOnFocus: false };

export const useProfile = () => useSWR("profile", () => getApi().getProfile(), options);
export const useLabs = () => useSWR("labs", () => getApi().getLabs(), options);
export const useWearables = (days = 30) => useSWR(["wearables", days], () => getApi().getWearables(days), options);
export const useGenetics = () => useSWR("genetics", () => getApi().getGenetics(), options);
export const useDiary = () => useSWR("diary", () => getApi().listDiary(), options);
export const useSummaries = () => useSWR("summaries", () => getApi().listSummaries(), options);
export const useAppointmentQuestions = () =>
  useSWR("appointment-questions", () => getApi().listAppointmentQuestions(), options);
