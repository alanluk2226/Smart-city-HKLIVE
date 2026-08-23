# 香港城市實況

以政府公開資料組成的網頁主控台：交通到達時間、天氣、急症室輪候、運輸署 CCTV、停車場空位、康文署場地。

## 啟動

```
npm install
npm run dev
```

瀏覽器開啟 http://localhost:3000

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
- `/parking` 停車場空位
- `/facilities` 康文署羽毛球場／籃球場

所有外部 API 都經 Next.js 伺服器代理，避免瀏覽器 CORS 問題。
