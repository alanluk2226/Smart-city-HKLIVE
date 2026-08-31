"use client";

import { AppShell } from "@/components/AppShell";
import { useLocationPref } from "@/components/LocationPrefProvider";
import { useTheme } from "@/components/ThemeProvider";
import type { ThemeMode } from "@/lib/theme";

const DATA_SOURCES = [
  { name: "DATA.GOV.HK", use: "公開數據總門戶" },
  { name: "香港天文台", use: "天氣、警告、特別天氣提示" },
  { name: "環境保護署", use: "空氣質素健康指數（AQHI）" },
  { name: "醫院管理局", use: "急症室輪候、專科門診新症預約時間" },
  { name: "運輸署", use: "道路 CCTV、特別交通消息、停車場空位、部分交通靜態資料" },
  { name: "康樂及文化事務署", use: "體育館、球場、泳池、泳灘等場地資料" },
  { name: "公共交通營運商", use: "巴士、小巴、港鐵、輕鐵、渡輪、電車等到達／路線資料" },
];

export function SettingsApp() {
  const { theme, setTheme } = useTheme();
  const { locationEnabled, setLocationEnabled } = useLocationPref();

  return (
    <AppShell title="設定" subtitle="外觀、定位、資料來源同私隱說明">
      <div className="mx-auto max-w-xl space-y-4">
        <section className="rounded-2xl border border-line bg-card p-4 sm:p-5">
          <h2 className="text-base font-medium">外觀</h2>
          <p className="mt-1 text-sm text-muted">選擇淺色或深色模式。</p>
          <div className="mt-4 grid grid-cols-2 gap-2">
            {(
              [
                { id: "light" as const, label: "淺色", Icon: SunIcon },
                { id: "dark" as const, label: "深色", Icon: MoonIcon },
              ] as const
            ).map((opt) => {
              const active = theme === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setTheme(opt.id as ThemeMode)}
                  className={`flex flex-col items-center gap-2 rounded-xl border px-3 py-4 transition ${
                    active
                      ? "border-teal/50 bg-teal/15 text-ink"
                      : "border-line text-muted hover:border-teal/30 hover:text-ink"
                  }`}
                  aria-pressed={active}
                  aria-label={`${opt.label}模式`}
                >
                  <opt.Icon />
                  <span className="text-sm font-medium">{opt.label}</span>
                </button>
              );
            })}
          </div>
        </section>

        <section className="rounded-2xl border border-line bg-card p-4 sm:p-5">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h2 className="text-base font-medium">定位</h2>
              <p className="mt-1 text-sm text-muted">
                開啟後可用「使用我的位置」、附近站點／場地排序，以及港鐵／輕鐵定位。關閉後本網站唔會自動或手動取用位置。
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={locationEnabled}
              aria-label={locationEnabled ? "關閉定位" : "開啟定位"}
              onClick={() => setLocationEnabled(!locationEnabled)}
              className={`relative mt-0.5 h-7 w-12 shrink-0 rounded-full transition ${
                locationEnabled ? "bg-teal" : "bg-line"
              }`}
            >
              <span
                className={`absolute top-0.5 left-0.5 h-6 w-6 rounded-full bg-card shadow transition ${
                  locationEnabled ? "translate-x-5" : "translate-x-0"
                }`}
              />
            </button>
          </div>
          <p className={`mt-3 text-xs ${locationEnabled ? "text-teal" : "text-muted"}`}>
            而家：{locationEnabled ? "已開啟定位" : "已關閉定位"}
          </p>
        </section>

        <section id="sources" className="scroll-mt-28 rounded-2xl border border-line bg-card p-4 sm:p-5">
          <h2 className="text-base font-medium">資料來源</h2>
          <p className="mt-1 text-sm text-muted">
            本網站整合香港政府及營運商公開資料，僅供參考，請以官方公布為準。
          </p>
          <ul className="mt-4 space-y-2.5">
            {DATA_SOURCES.map((s) => (
              <li key={s.name} className="flex gap-2 text-sm">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-teal/70" aria-hidden />
                <span>
                  <span className="font-medium text-ink">{s.name}</span>
                  <span className="text-muted"> — {s.use}</span>
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-xs text-muted">
            部分模組（例如電車班次估算、地圖底圖）可能另有補充說明；實時數據或會延遲或短暫中斷。
          </p>
        </section>

        <section id="privacy" className="scroll-mt-28 rounded-2xl border border-line bg-card p-4 sm:p-5">
          <h2 className="text-base font-medium">私隱說明</h2>
          <p className="mt-1 text-sm text-muted">
            以下說明本網站如何處理同《個人資料（私隱）條例》（香港法例第 486 章）相關嘅資料。本網站唔會要求你註冊帳戶。
          </p>
          <div className="mt-4 space-y-4 text-sm leading-relaxed text-muted">
            <div>
              <h3 className="font-medium text-ink">我哋唔會做咩</h3>
              <ul className="mt-1.5 list-disc space-y-1 pl-5">
                <li>唔會收集姓名、電話、電郵等聯絡資料</li>
                <li>唔會用你嘅資料做直接促銷或建立廣告檔案</li>
                <li>唔會出售個人資料</li>
              </ul>
            </div>
            <div>
              <h3 className="font-medium text-ink">儲存在你裝置嘅設定</h3>
              <p className="mt-1.5">
                主題（淺色／深色）、定位開關、突發提示收起狀態、出行助手收藏／歷史等，會用瀏覽器{" "}
                <span className="text-ink">localStorage / sessionStorage</span>{" "}
                保存在本機。你可以隨時清除瀏覽器網站資料刪除。
              </p>
            </div>
            <div>
              <h3 className="font-medium text-ink">位置資料</h3>
              <p className="mt-1.5">
                只有你批准瀏覽器定位、而且本頁「定位」開關為開啟時，網站先會取用大約位置，用來顯示附近站點、醫院、停車場等。座標可能會短暫隨查詢傳到本網站伺服器（例如{" "}
                <span className="font-mono text-[11px] text-ink">lat / lng</span>{" "}
                參數）以便計算距離，但唔會用作建立個人檔案或長期保存行程軌跡。關閉定位後，網站唔會再請求位置。
              </p>
            </div>
            <div>
              <h3 className="font-medium text-ink">出行助手（如有啟用）</h3>
              <p className="mt-1.5">
                若伺服器已設定 AI 金鑰，你輸入嘅起點、終點同相關查詢會經本網站伺服器傳送至第三方 AI 服務以產生建議。請避免輸入敏感個人資料。
              </p>
            </div>
            <div>
              <h3 className="font-medium text-ink">對外連線</h3>
              <p className="mt-1.5">
                為顯示公開數據，伺服器會向天文台、DATA.GOV.HK、運輸署、醫管局、康文署及各交通營運商等來源擷取資料。地圖底圖可能由 Google Maps 或 OpenStreetMap 提供（視環境設定而定）。
              </p>
            </div>
            <div>
              <h3 className="font-medium text-ink">你的選擇</h3>
              <p className="mt-1.5">
                你可以拒絕瀏覽器定位、在本頁關閉定位、改用淺色／深色，或清除瀏覽器儲存資料。若對資料處理有疑問，請以各數據提供機構嘅官方私隱政策為準。
              </p>
            </div>
            <p className="text-xs">
              本說明只適用於此「香港城市實況」網站嘅運作方式，並非法律意見。資料內容以各官方來源為準。
            </p>
          </div>
        </section>
      </div>
    </AppShell>
  );
}

function SunIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M12 3v2.2M12 18.8V21M4.9 4.9l1.6 1.6M17.5 17.5l1.6 1.6M3 12h2.2M18.8 12H21M4.9 19.1l1.6-1.6M17.5 6.5l1.6-1.6"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M16.5 3.5A8.5 8.5 0 1 0 20.5 14 6.8 6.8 0 0 1 16.5 3.5Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  );
}
