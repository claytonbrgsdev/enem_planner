
export const getTodayDateString = (): string => {
    const today = new Date();
    return toYYYYMMDD(today);
};

export const toYYYYMMDD = (date: Date): string => {
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    return `${year}-${month}-${day}`;
};

export const parseYYYYMMDD = (dateString: string): Date => {
    const [year, month, day] = dateString.split('-').map(Number);
    // Month is 0-indexed in JS Date
    return new Date(year, month - 1, day);
};

export const addDays = (dateString: string, days: number): string => {
    const date = parseYYYYMMDD(dateString);
    date.setDate(date.getDate() + days);
    return toYYYYMMDD(date);
};

export const getDayOfWeek = (dateString: string): number => {
    const date = parseYYYYMMDD(dateString);
    return date.getDay(); // 0 for Sunday, 1 for Monday, etc.
};

export const getDaysBetween = (dateStr1: string, dateStr2: string): number => {
    const date1 = parseYYYYMMDD(dateStr1);
    const date2 = parseYYYYMMDD(dateStr2);
    const diffTime = Math.abs(date2.getTime() - date1.getTime());
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
};
