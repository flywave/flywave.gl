/* Copyright (C) 2025 flywave.gl contributors */

// julian-date.ts
interface LeapSecond {
    julianDate: JulianDate;
    offset: number;
}

export enum TimeStandard {
    TAI = "TAI",
    UTC = "UTC"
}

interface GregorianDate {
    year: number;
    month: number;
    day: number;
    hour: number;
    minute: number;
    second: number;
    millisecond: number;
    isLeapSecond: boolean;
}

export class TimeConstants {
    static readonly SECONDS_PER_MILLISECOND = 0.001;
    static readonly MILLISECONDS_PER_SECOND = 1000.0;
    static readonly SECONDS_PER_MINUTE = 60.0;
    static readonly MINUTES_PER_HOUR = 60.0;
    static readonly SECONDS_PER_HOUR = 3600.0;
    static readonly HOURS_PER_DAY = 24.0;
    static readonly SECONDS_PER_DAY = 86400.0;
    static readonly DAYS_PER_JULIAN_CENTURY = 36525.0;
    static readonly MODIFIED_JULIAN_DATE_DIFFERENCE = 2400000.5;
}

// Helper class
class LeapSecond {
    constructor(public julianDate: JulianDate, public offset: number) {}
}

export class JulianDate {
    dayNumber: number;
    secondsOfDay: number;

    private static readonly leapSeconds: LeapSecond[] = [
        new LeapSecond(new JulianDate(2441317, 43210.0, TimeStandard.TAI), 10), // 1972-01-01
        new LeapSecond(new JulianDate(2441499, 43211.0, TimeStandard.TAI), 11), // 1972-07-01
        new LeapSecond(new JulianDate(2441683, 43212.0, TimeStandard.TAI), 12), // 1973-01-01
        new LeapSecond(new JulianDate(2442048, 43213.0, TimeStandard.TAI), 13), // 1974-01-01
        new LeapSecond(new JulianDate(2442413, 43214.0, TimeStandard.TAI), 14), // 1975-01-01
        new LeapSecond(new JulianDate(2442778, 43215.0, TimeStandard.TAI), 15), // 1976-01-01
        new LeapSecond(new JulianDate(2443144, 43216.0, TimeStandard.TAI), 16), // 1977-01-01
        new LeapSecond(new JulianDate(2443509, 43217.0, TimeStandard.TAI), 17), // 1978-01-01
        new LeapSecond(new JulianDate(2443874, 43218.0, TimeStandard.TAI), 18), // 1979-01-01
        new LeapSecond(new JulianDate(2444239, 43219.0, TimeStandard.TAI), 19), // 1980-01-01
        new LeapSecond(new JulianDate(2444786, 43220.0, TimeStandard.TAI), 20), // 1981-07-01
        new LeapSecond(new JulianDate(2445151, 43221.0, TimeStandard.TAI), 21), // 1982-07-01
        new LeapSecond(new JulianDate(2445516, 43222.0, TimeStandard.TAI), 22), // 1983-07-01
        new LeapSecond(new JulianDate(2446247, 43223.0, TimeStandard.TAI), 23), // 1985-07-01
        new LeapSecond(new JulianDate(2447161, 43224.0, TimeStandard.TAI), 24), // 1988-01-01
        new LeapSecond(new JulianDate(2447892, 43225.0, TimeStandard.TAI), 25), // 1990-01-01
        new LeapSecond(new JulianDate(2448257, 43226.0, TimeStandard.TAI), 26), // 1991-01-01
        new LeapSecond(new JulianDate(2448804, 43227.0, TimeStandard.TAI), 27), // 1992-07-01
        new LeapSecond(new JulianDate(2449169, 43228.0, TimeStandard.TAI), 28), // 1993-07-01
        new LeapSecond(new JulianDate(2449534, 43229.0, TimeStandard.TAI), 29), // 1994-07-01
        new LeapSecond(new JulianDate(2450083, 43230.0, TimeStandard.TAI), 30), // 1996-01-01
        new LeapSecond(new JulianDate(2450630, 43231.0, TimeStandard.TAI), 31), // 1997-07-01
        new LeapSecond(new JulianDate(2451179, 43232.0, TimeStandard.TAI), 32), // 1999-01-01
        new LeapSecond(new JulianDate(2453736, 43233.0, TimeStandard.TAI), 33), // 2006-01-01
        new LeapSecond(new JulianDate(2454832, 43234.0, TimeStandard.TAI), 34), // 2009-01-01
        new LeapSecond(new JulianDate(2456109, 43235.0, TimeStandard.TAI), 35), // 2012-07-01
        new LeapSecond(new JulianDate(2457204, 43236.0, TimeStandard.TAI), 36), // 2015-07-01
        new LeapSecond(new JulianDate(2457754, 43237.0, TimeStandard.TAI), 37) // 2017-01-01
    ];

    constructor(
        julianDayNumber: number = 0,
        secondsOfDay: number = 0,
        timeStandard: TimeStandard = TimeStandard.UTC
    ) {
        // 处理小数天数
        const wholeDays = julianDayNumber | 0;
        secondsOfDay += (julianDayNumber - wholeDays) * TimeConstants.SECONDS_PER_DAY;

        // 设置组件
        this.dayNumber = wholeDays;
        this.secondsOfDay = secondsOfDay;

        // 标准化
        this.normalize();

        // UTC 转 TAI
        if (timeStandard === TimeStandard.UTC) {
            this.convertUtcToTai();
        }
    }

    static totalDays(julianDate: JulianDate) {
        //>>includeStart('debug', pragmas.debug);
        return julianDate.dayNumber + julianDate.secondsOfDay / TimeConstants.SECONDS_PER_DAY;
    }

    private normalize(): void {
        const extraDays = (this.secondsOfDay / TimeConstants.SECONDS_PER_DAY) | 0;
        this.dayNumber += extraDays;
        this.secondsOfDay -= TimeConstants.SECONDS_PER_DAY * extraDays;

        if (this.secondsOfDay < 0) {
            this.dayNumber--;
            this.secondsOfDay += TimeConstants.SECONDS_PER_DAY;
        }
    }

    private convertUtcToTai(): void {
        const binarySearchScratch = { julianDate: this };
        const index = this.binarySearchLeapSeconds(binarySearchScratch);

        let offset = JulianDate.leapSeconds[index].offset;
        if (index > 0) {
            const difference = JulianDate.secondsDifference(
                JulianDate.leapSeconds[index].julianDate,
                this
            );
            if (difference > offset) {
                offset = JulianDate.leapSeconds[index - 1].offset;
            }
        }

        JulianDate.addSeconds(this, offset, this);
    }

    private binarySearchLeapSeconds(scratch: { julianDate: JulianDate }): number {
        let low = 0;
        let high = JulianDate.leapSeconds.length - 1;
        let mid = 0;

        while (low <= high) {
            mid = (low + high) >>> 1;
            const cmp = JulianDate.compare(
                JulianDate.leapSeconds[mid].julianDate,
                scratch.julianDate
            );

            if (cmp < 0) {
                low = mid + 1;
            } else if (cmp > 0) {
                high = mid - 1;
            } else {
                return mid;
            }
        }

        return low < JulianDate.leapSeconds.length ? low : JulianDate.leapSeconds.length - 1;
    }

    // ============== 静态方法 ==============
    static fromDate(date: Date, result?: JulianDate): JulianDate {
        if (!(date instanceof Date)) throw new Error("Invalid JavaScript Date");

        const components = this.computeJulianDateComponents(
            date.getUTCFullYear(),
            date.getUTCMonth() + 1,
            date.getUTCDate(),
            date.getUTCHours(),
            date.getUTCMinutes(),
            date.getUTCSeconds(),
            date.getUTCMilliseconds()
        );

        if (!result) return new JulianDate(components[0], components[1], TimeStandard.UTC);

        result.dayNumber = components[0];
        result.secondsOfDay = components[1];
        result.convertUtcToTai();
        return result;
    }

    private static computeJulianDateComponents(
        year: number,
        month: number,
        day: number,
        hour: number,
        minute: number,
        second: number,
        millisecond: number
    ): [number, number] {
        // 算法来自《天文历书解释性补充》第604页
        const a = ((month - 14) / 12) | 0;
        const b = year + 4800 + a;
        year + 4800 + a;
        let dayNumber =
            (((1461 * b) / 4) | 0) +
            (((367 * (month - 2 - 12 * a)) / 12) | 0) -
            (((3 * (((b + 100) / 100) | 0)) / 4) | 0) +
            day -
            32075;

        // JulianDates are noon-based
        hour = hour - 12;
        if (hour < 0) {
            hour += 24;
        }

        const secondsOfDay =
            second +
            (hour * TimeConstants.SECONDS_PER_HOUR +
                minute * TimeConstants.SECONDS_PER_MINUTE +
                millisecond * TimeConstants.SECONDS_PER_MILLISECOND);

        if (secondsOfDay >= 43200.0) {
            dayNumber -= 1;
        }

        return [dayNumber, secondsOfDay];
    }

    static now(result?: JulianDate): JulianDate {
        return JulianDate.fromDate(new Date(), result);
    }

    static addSeconds(julianDate: JulianDate, seconds: number, result: JulianDate): JulianDate {
        if (!result) result = new JulianDate();

        result.dayNumber = julianDate.dayNumber;
        result.secondsOfDay = julianDate.secondsOfDay + seconds;
        result.normalize();

        return result;
    }

    static secondsDifference(left: JulianDate, right: JulianDate): number {
        return (
            (left.dayNumber - right.dayNumber) * TimeConstants.SECONDS_PER_DAY +
            (left.secondsOfDay - right.secondsOfDay)
        );
    }

    static compare(left: JulianDate, right: JulianDate): number {
        const dayDiff = left.dayNumber - right.dayNumber;
        return dayDiff !== 0 ? dayDiff : left.secondsOfDay - right.secondsOfDay;
    }

    static computeTaiMinusUtc(julianDate: JulianDate): number {
        const index = this.findLeapSecondIndex(julianDate);
        return JulianDate.leapSeconds[index].offset;
    }

    private static findLeapSecondIndex(date: JulianDate): number {
        const scratch = { julianDate: date };
        const index = 0;

        // 二分查找实现...
        return index;
    }

    // ============== 实例方法 ==============
    clone(result?: JulianDate): JulianDate {
        return JulianDate.clone(this, result);
    }

    static clone(julianDate: JulianDate, result?: JulianDate): JulianDate {
        if (!result)
            return new JulianDate(julianDate.dayNumber, julianDate.secondsOfDay, TimeStandard.TAI);

        result.dayNumber = julianDate.dayNumber;
        result.secondsOfDay = julianDate.secondsOfDay;
        return result;
    }

    toGregorianDate(result?: GregorianDate): GregorianDate {
        // 转换实现...
        return result!;
    }

    toDate(): Date {
        const gDate = this.toGregorianDate();
        return new Date(
            Date.UTC(
                gDate.year,
                gDate.month - 1,
                gDate.day,
                gDate.hour,
                gDate.minute,
                gDate.second,
                gDate.millisecond
            )
        );
    }
}
