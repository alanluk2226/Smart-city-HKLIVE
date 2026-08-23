export type LrtZone = "屯門" | "天水圍" | "元朗";

export type LrtStation = {
  id: number;
  code: string;
  name: string;
  nameEn: string;
  zone: LrtZone;
  lat: number;
  lng: number;
};

export const LRT_ZONES: LrtZone[] = ["屯門", "天水圍", "元朗"];

export const LRT_STATIONS: LrtStation[] = [
  { id: 1, code: "FEP", name: "屯門碼頭", nameEn: "Tuen Mun Ferry Pier", zone: "屯門", lat: 22.3718, lng: 113.9659 },
  { id: 10, code: "MEG", name: "美樂", nameEn: "Melody Garden", zone: "屯門", lat: 22.3785, lng: 113.9628 },
  { id: 15, code: "BUT", name: "蝴蝶", nameEn: "Butterfly", zone: "屯門", lat: 22.3842, lng: 113.9615 },
  { id: 20, code: "LRD", name: "輕鐵車廠", nameEn: "Light Rail Depot", zone: "屯門", lat: 22.3864, lng: 113.9688 },
  { id: 30, code: "LUM", name: "龍門", nameEn: "Lung Mun", zone: "屯門", lat: 22.3856, lng: 113.9766 },
  { id: 40, code: "TSS", name: "青山村", nameEn: "Tsing Shan Tsuen", zone: "屯門", lat: 22.3889, lng: 113.9794 },
  { id: 50, code: "TWN", name: "青雲", nameEn: "Tsing Wun", zone: "屯門", lat: 22.3932, lng: 113.9798 },
  { id: 60, code: "KIO", name: "建安", nameEn: "Kin On", zone: "屯門", lat: 22.3949, lng: 113.9708 },
  { id: 70, code: "HOT", name: "河田", nameEn: "Ho Tin", zone: "屯門", lat: 22.3978, lng: 113.9736 },
  { id: 75, code: "CYB", name: "蔡意橋", nameEn: "Choy Yee Bridge", zone: "屯門", lat: 22.4007, lng: 113.9749 },
  { id: 80, code: "AFF", name: "澤豐", nameEn: "Affluence", zone: "屯門", lat: 22.4049, lng: 113.9766 },
  { id: 90, code: "TMH", name: "屯門醫院", nameEn: "Tuen Mun Hospital", zone: "屯門", lat: 22.4078, lng: 113.9772 },
  { id: 100, code: "SHL", name: "兆康", nameEn: "Siu Hong", zone: "屯門", lat: 22.4113, lng: 113.9788 },
  { id: 110, code: "KEL", name: "麒麟", nameEn: "Kei Lun", zone: "屯門", lat: 22.4156, lng: 113.9771 },
  { id: 120, code: "CHC", name: "青松", nameEn: "Ching Chung", zone: "屯門", lat: 22.4178, lng: 113.9722 },
  { id: 130, code: "KIS", name: "建生", nameEn: "Kin Sang", zone: "屯門", lat: 22.4186, lng: 113.9674 },
  { id: 140, code: "TNK", name: "田景", nameEn: "Tin King", zone: "屯門", lat: 22.4172, lng: 113.9628 },
  { id: 150, code: "LEK", name: "良景", nameEn: "Leung King", zone: "屯門", lat: 22.4144, lng: 113.9611 },
  { id: 160, code: "SAW", name: "新圍", nameEn: "San Wai", zone: "屯門", lat: 22.4108, lng: 113.9619 },
  { id: 170, code: "SHP", name: "石排", nameEn: "Shek Pai", zone: "屯門", lat: 22.4072, lng: 113.9648 },
  { id: 180, code: "SKN", name: "山景(北)", nameEn: "Shan King (North)", zone: "屯門", lat: 22.4038, lng: 113.9622 },
  { id: 190, code: "SKS", name: "山景(南)", nameEn: "Shan King (South)", zone: "屯門", lat: 22.4011, lng: 113.9628 },
  { id: 200, code: "MIK", name: "鳴琴", nameEn: "Ming Kum", zone: "屯門", lat: 22.3968, lng: 113.9641 },
  { id: 212, code: "THN", name: "大興(北)", nameEn: "Tai Hing (North)", zone: "屯門", lat: 22.4033, lng: 113.9694 },
  { id: 220, code: "THS", name: "大興(南)", nameEn: "Tai Hing (South)", zone: "屯門", lat: 22.4006, lng: 113.9702 },
  { id: 230, code: "NGW", name: "銀圍", nameEn: "Ngan Wai", zone: "屯門", lat: 22.3984, lng: 113.9718 },
  { id: 240, code: "SHE", name: "兆禧", nameEn: "Siu Hei", zone: "屯門", lat: 22.3756, lng: 113.9698 },
  { id: 250, code: "TSP", name: "海皇路", nameEn: "Hoi Wong Road", zone: "屯門", lat: 22.3788, lng: 113.9731 },
  { id: 260, code: "GOG", name: "豐景園", nameEn: "Goodview Garden", zone: "屯門", lat: 22.3816, lng: 113.9758 },
  { id: 265, code: "SIL", name: "兆麟", nameEn: "Siu Lun", zone: "屯門", lat: 22.3849, lng: 113.9776 },
  { id: 270, code: "ONT", name: "安定", nameEn: "On Ting", zone: "屯門", lat: 22.3878, lng: 113.9752 },
  { id: 275, code: "YAO", name: "友愛", nameEn: "Yau Oi", zone: "屯門", lat: 22.3852, lng: 113.9718 },
  { id: 280, code: "TOC", name: "市中心", nameEn: "Town Centre", zone: "屯門", lat: 22.3908, lng: 113.9759 },
  { id: 295, code: "TML", name: "屯門", nameEn: "Tuen Mun", zone: "屯門", lat: 22.3948, lng: 113.9731 },
  { id: 300, code: "PUT", name: "杯渡", nameEn: "Pui To", zone: "屯門", lat: 22.3972, lng: 113.9768 },
  { id: 310, code: "HFT", name: "何福堂", nameEn: "Hoh Fuk Tong", zone: "屯門", lat: 22.3996, lng: 113.9794 },
  { id: 320, code: "SAH", name: "新墟", nameEn: "San Hui", zone: "屯門", lat: 22.4038, lng: 113.9806 },
  { id: 330, code: "PRV", name: "景峰", nameEn: "Prime View", zone: "屯門", lat: 22.4072, lng: 113.9818 },
  { id: 340, code: "FUT", name: "鳳地", nameEn: "Fung Tei", zone: "屯門", lat: 22.4096, lng: 113.9802 },
  { id: 920, code: "SAS", name: "三聖", nameEn: "Sam Shing", zone: "屯門", lat: 22.3822, lng: 113.9806 },
  { id: 425, code: "HMT", name: "坑尾村", nameEn: "Hang Mei Tsuen", zone: "天水圍", lat: 22.4446, lng: 114.0022 },
  { id: 430, code: "TSL", name: "天水圍", nameEn: "Tin Shui Wai", zone: "天水圍", lat: 22.4481, lng: 114.0048 },
  { id: 435, code: "TIT", name: "天慈", nameEn: "Tin Tsz", zone: "天水圍", lat: 22.4512, lng: 114.0066 },
  { id: 445, code: "TIY", name: "天耀", nameEn: "Tin Yiu", zone: "天水圍", lat: 22.4506, lng: 114.0012 },
  { id: 448, code: "LOC", name: "樂湖", nameEn: "Locwood", zone: "天水圍", lat: 22.4538, lng: 113.9994 },
  { id: 450, code: "TWU", name: "天湖", nameEn: "Tin Wu", zone: "天水圍", lat: 22.4542, lng: 114.0058 },
  { id: 455, code: "GIN", name: "銀座", nameEn: "Ginza", zone: "天水圍", lat: 22.4572, lng: 114.0064 },
  { id: 460, code: "TSU", name: "天瑞", nameEn: "Tin Shui", zone: "天水圍", lat: 22.4568, lng: 113.9982 },
  { id: 468, code: "CHF", name: "頌富", nameEn: "Chung Fu", zone: "天水圍", lat: 22.4602, lng: 113.9974 },
  { id: 480, code: "TFU", name: "天富", nameEn: "Tin Fu", zone: "天水圍", lat: 22.4636, lng: 113.9978 },
  { id: 490, code: "CHE", name: "翠湖", nameEn: "Chestwood", zone: "天水圍", lat: 22.4588, lng: 114.0028 },
  { id: 500, code: "TWI", name: "天榮", nameEn: "Tin Wing", zone: "天水圍", lat: 22.4604, lng: 114.0069 },
  { id: 510, code: "TYU", name: "天悅", nameEn: "Tin Yuet", zone: "天水圍", lat: 22.4648, lng: 114.0062 },
  { id: 520, code: "TSA", name: "天秀", nameEn: "Tin Sau", zone: "天水圍", lat: 22.4676, lng: 114.0028 },
  { id: 530, code: "WEP", name: "濕地公園", nameEn: "Wetland Park", zone: "天水圍", lat: 22.4702, lng: 113.9994 },
  { id: 540, code: "THE", name: "天恒", nameEn: "Tin Heng", zone: "天水圍", lat: 22.4716, lng: 113.9958 },
  { id: 550, code: "TYA", name: "天逸", nameEn: "Tin Yat", zone: "天水圍", lat: 22.4684, lng: 113.9946 },
  { id: 350, code: "LTE", name: "藍地", nameEn: "Lam Tei", zone: "元朗", lat: 22.4184, lng: 113.9836 },
  { id: 360, code: "NAW", name: "泥圍", nameEn: "Nai Wai", zone: "元朗", lat: 22.4236, lng: 113.9878 },
  { id: 370, code: "CUT", name: "鍾屋村", nameEn: "Chung Uk Tsuen", zone: "元朗", lat: 22.4296, lng: 113.9926 },
  { id: 380, code: "HSK", name: "洪水橋", nameEn: "Hung Shui Kiu", zone: "元朗", lat: 22.4338, lng: 113.9972 },
  { id: 390, code: "TOF", name: "塘坊村", nameEn: "Tong Fong Tsuen", zone: "元朗", lat: 22.4386, lng: 114.0068 },
  { id: 400, code: "PIS", name: "屏山", nameEn: "Ping Shan", zone: "元朗", lat: 22.4408, lng: 114.0118 },
  { id: 560, code: "SPW", name: "水邊圍", nameEn: "Shui Pin Wai", zone: "元朗", lat: 22.4426, lng: 114.0188 },
  { id: 570, code: "FNR", name: "豐年路", nameEn: "Fung Nin Road", zone: "元朗", lat: 22.4442, lng: 114.0236 },
  { id: 580, code: "HLR", name: "康樂路", nameEn: "Hong Lok Road", zone: "元朗", lat: 22.4452, lng: 114.0278 },
  { id: 590, code: "TTR", name: "大棠路", nameEn: "Tai Tong Road", zone: "元朗", lat: 22.4456, lng: 114.0316 },
  { id: 600, code: "YLL", name: "元朗", nameEn: "Yuen Long", zone: "元朗", lat: 22.446, lng: 114.0353 },
];

export function lrtStation(id: string | number) {
  const n = String(id);
  return LRT_STATIONS.find((s) => String(s.id) === n || s.code === n) ?? null;
}

export function lrtName(id: string | number) {
  return lrtStation(id)?.name ?? String(id);
}

export function searchLrtStations(q: string, zone?: string): LrtStation[] {
  const n = q.trim().toLowerCase();
  return LRT_STATIONS.filter((s) => {
    if (zone && s.zone !== zone) return false;
    if (!n) return true;
    return (
      s.name.toLowerCase().includes(n) ||
      s.nameEn.toLowerCase().includes(n) ||
      s.code.toLowerCase() === n ||
      String(s.id) === n
    );
  });
}

