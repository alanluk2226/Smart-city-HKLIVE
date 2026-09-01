import type { EtaResult } from "@/lib/types";

/** Remarks that mean this departure should be hidden; UI jumps to the next usable bus. */
const SKIP_REMARK =
  /延誤|延遲|暫停服務|暫停|取消|停止服務|服務受阻|脫班|delay(?:ed)?|cancelled?|suspend(?:ed)?/i;

export function isSkippedEtaRemark(remark: string | undefined | null): boolean {
  if (!remark?.trim()) return false;
  return SKIP_REMARK.test(remark);
}

/** Drop delayed / cancelled / suspended rows; keep order of remaining departures. */
export function filterDisplayEtas(etas: EtaResult[]): EtaResult[] {
  return etas.filter((eta) => !isSkippedEtaRemark(eta.remark));
}
