export type Operator = "kmb" | "ctb" | "nlb" | "gmb" | "mtr" | "lrt";

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

export type MtrTripLeg = {
  line: string;
  lineName: string;
  from: string;
  fromName: string;
  to: string;
  toName: string;
  stops: MtrTripStop[];
  minutes: number;
};

export type MtrCarLoad = {
  car: number;
  level: 1 | 2 | 3 | 4;
};

export type MtrTripPlan = {
  from: string;
  to: string;
  fromName: string;
  toName: string;
  minutes: number;
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
  crowding: {
    line: string;
    lineName: string;
    peak: boolean;
    cars: MtrCarLoad[];
    emptier: number[];
    note: string;
  };
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
