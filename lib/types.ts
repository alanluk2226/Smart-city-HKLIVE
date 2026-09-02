export type Operator = "kmb" | "ctb" | "nlb" | "mtrb" | "gmb" | "mtr" | "lrt" | "tram" | "ferry" | "taxi";

export type OccupancyLevel = "seats" | "standing" | "full";

export type EtaResult = {
  operator: Operator;
  operatorName: string;
  route: string;
  dest: string;
  stopId: string;
  stopName: string;
  etaMinutes: number | null;
  etaTime: string | null;
  remark?: string;
  platform?: string;
  plate?: string;
  occupancy?: OccupancyLevel;
  seatsLeft?: number;
  region?: string;
  /** 巴士距離此站剩餘路程（米） */
  distanceMeters?: number | null;
  /** true = 以車速估算，非 GPS／站序推算 */
  distanceEstimate?: boolean;
};

export type RouteHit = {
  operator: Operator;
  operatorName: string;
  route: string;
  orig: string;
  dest: string;
  bound?: string;
  serviceType?: string;
  region?: string;
  routeId?: string;
  subtitle: string;
};

export type RouteInfo = {
  fareAdult: number | null;
  journeyMinutes: number | null;
  remainingMinutes: number | null;
  destName: string | null;
  note?: string;
};

export type StopHit = {
  operator: Operator;
  operatorName: string;
  stopId: string;
  name: string;
  seq?: number;
  lat?: number;
  lng?: number;
  distanceMeters?: number;
  route?: string;
  bound?: string;
  serviceType?: string;
  region?: string;
  routeId?: string;
  routeSeq?: number;
  routeIds?: string[];
};

export type MtrStation = {
  code: string;
  name: string;
  nameEn: string;
  lines: string[];
  lat: number;
  lng: number;
};

export type MtrTripStop = {
  code: string;
  name: string;
};

export type MtrCarLoad = {
  car: number;
  level: 1 | 2 | 3 | 4;
};

export type MtrCarCrowding = {
  line: string;
  lineName: string;
  peak: boolean;
  cars: MtrCarLoad[];
  emptier: number[];
  note: string;
};

export type MtrTripLeg = {
  line: string;
  lineName: string;
  from: string;
  fromName: string;
  to: string;
  toName: string;
  stops: MtrTripStop[];
  /** Ride / walk time for this leg only (minutes). */
  minutes: number;
  /** Same-station interchange before boarding this leg. */
  interchangeBeforeMin?: number;
  /** Heuristic car occupancy for this boarding line. */
  crowding?: MtrCarCrowding;
};

export type MtrTripPlan = {
  from: string;
  to: string;
  fromName: string;
  toName: string;
  minutes: number;
  rideMinutes: number;
  transferMinutes: number;
  waitMinutes: number;
  interchangeCount: number;
  legs: MtrTripLeg[];
  fares: {
    adult: number | null;
    student: number | null;
    elderly: number | null;
    studentLabel: string;
    elderlyLabel: string;
    note?: string;
  };
  /** @deprecated Prefer per-leg crowding; kept for first rail leg summary. */
  crowding: MtrCarCrowding;
};

export type HsrTrain = {
  id: string;
  depart: string;
  arrive: string;
  minutesUntil: number;
  durationMin: number;
  vibrant: boolean;
  tomorrow: boolean;
};

export type HsrDestGroup = {
  dest: string;
  destName: string;
  destEn: string;
  shortHaul: boolean;
  fareAdult: number | null;
  fareChild: number | null;
  trains: HsrTrain[];
};

export type HsrBoard = {
  fromName: string;
  fromNameEn: string;
  effectiveFrom: string;
  effectiveTo: string;
  access: string;
  groups: HsrDestGroup[];
};

export type RacecourseStatus = {
  open: boolean;
  trainsRunning: boolean;
  venue: "ST" | "HV" | null;
  session: "day" | "night" | "twilight" | null;
  hours: string | null;
  headline: string;
  detail: string;
  nextOpen: string | null;
};

export type Place = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  distanceMeters?: number;
  meta?: Record<string, string | number | null>;
};

/** Kept for saved-trip compatibility; UI no longer asks the user to pick. */
export type AiTripGoal = "fastest" | "cheapest" | "both";

export type AiTripMode =
  | "walk"
  | "mtr"
  | "bus"
  | "minibus"
  | "ferry"
  | "lrt"
  | "tram"
  | "mix";

export type AiTripOption = {
  id: string;
  mode: AiTripMode;
  title: string;
  minutes: number | null;
  fareHkd: number | null;
  steps: string[];
  why: string;
  weatherFit: "good" | "ok" | "poor";
  badges: string[];
  source: "computed" | "ai";
  mtrFrom?: string;
  mtrTo?: string;
};

export type AiTripAdvice = {
  fromName: string;
  toName: string;
  fromCode: string | null;
  toCode: string | null;
  goal: AiTripGoal;
  weather: {
    temperature: number | null;
    humidity: number | null;
    summary: string;
    warnings: string[];
    iconUrl: string | null;
  };
  weatherNote: string;
  recommendedId: string;
  options: AiTripOption[];
  /** Gemini-style conversational answer grounded on computed options. */
  reply: string;
  disclaimer: string;
  usedAi: boolean;
  /** Set when Gemini was attempted but failed (e.g. regional block). */
  aiError?: string | null;
};

export type AiAssistantChatTurn = {
  role: "user" | "assistant";
  text: string;
};

/** Unified assistant reply: free chat or grounded route advice. */
export type AiAssistantResponse = {
  mode: "route" | "chat";
  reply: string;
  usedAi: boolean;
  aiError?: string | null;
  advice: AiTripAdvice | null;
  /** Gemini 判定的起終點；route 模式會填，方便收藏即使冇本站計算。 */
  trip?: { from: string; to: string } | null;
};
