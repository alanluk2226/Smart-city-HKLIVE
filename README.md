# 香港城市實況

以政府公開資料組成的網頁主控台：交通到達時間、天氣、急症室輪候、運輸署 CCTV、停車場空位、康文署場地。頂欄下會顯示天文台警告／特別天氣提示，以及運輸署即時特別交通消息（車禍、封路等）。

## 啟動

```
npm install
npm run dev
```

瀏覽器開啟 http://localhost:3000

可選：複製 `.env.example` 為 `.env.local`，填入：

- `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`（Maps JavaScript API）。有 key 時街圖用 Google；否則用 OpenStreetMap。用量接近每月免費額度（預設 10,000 次 Dynamic Maps load 的 98%）會自動改用 OSM，至下個月太平洋時間重置。可設 `GOOGLE_MAPS_MONTHLY_BUDGET` 對齊 Cloud Console。本機預設 OSM，要試 Google 可加 `NEXT_PUBLIC_USE_GOOGLE_MAPS=1`。
- `GEMINI_API_KEY`（主控台出行助手；伺服器呼叫 Gemini 做多輪對話。問「點去」時路線／車費仍由本站計算，AI 只寫天氣評語）。冇 key 時點去問題仍可顯示港鐵等計算方案。Vercel 部署時 Functions 必須在 `hnd1` 東京（見 `vercel.json`）；香港 `hkg1` 會被 Gemini 拒絕，美國東部則對巴士 API 延遲較高。
- `GEMINI_DAILY_BUDGET`（可選；預設 `250`）。專案估算嘅 Gemini 免費日配額（RPD）；用量達 98% 會全日暫停出行 AI，至香港時間翌日 0:00。每日另限 20 次免費提問（用盡後提示）。
- `OSRM_BASE_URL`（自架 OSRM；預設用公共 demo server）。巴士／小巴地圖的行車線靠佢由站點順序計出。
- `KV_REST_API_URL` + `KV_REST_API_TOKEN`（或 `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`）：行車線算好後長期存落 KV，第二次有人開同一條線即時出圖。冇設定時改用 Next.js data cache。

## 模組

- `/` 主控台入口
- `/transit` 交通到達總覽
- `/transit/bus` 九巴／龍運、城巴
- `/transit/minibus` 專線小巴
- `/transit/lrt` 輕鐵
- `/transit/mtr` 港鐵：官方路綫圖點選車站查看班次
- `/weather` 天文台現況、警報、九天天氣
- `/health` 18 間急症室輪候
- `/traffic` 運輸署道路 CCTV
- `/parking` 全港停車場空位（按港島／九龍／新界同行政區瀏覽）
- `/facilities` 全港康文署場地（體育館、球場、泳池、泳灘等）

所有外部 API 都經 Next.js 伺服器代理，避免瀏覽器 CORS 問題。
