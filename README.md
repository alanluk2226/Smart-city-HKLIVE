# 香港城市實況

以政府公開資料組成的網頁主控台：交通到達時間、天氣、急症室輪候、運輸署 CCTV、停車場空位、康文署場地。頂欄下會顯示天文台警告／特別天氣提示，以及運輸署即時特別交通消息（車禍、封路等）。

## 啟動

```
npm install
npm run dev
```

瀏覽器開啟 http://localhost:3000

可選：複製 `.env.example` 為 `.env.local`，填入：

- `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`（Maps JavaScript API）。有 key 時街圖用 Google；否則用 OpenStreetMap。
- `GEMINI_API_KEY`（主控台出行助手；只在伺服器呼叫 Gemini，比較天氣／步行／港鐵／巴士）。冇 key 時仍會顯示港鐵同步行計算。

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
