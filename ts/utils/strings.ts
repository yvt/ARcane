
export function stringRepeat(str: string, count: number): string
{
   const parts: string[] = [];
   for (let i = 0; i < count; ++i) {
       parts.push(str);
   }
   return parts.join("");
}

export function fillWith(str: string, ln: number, ch: string): string
{
    return str + stringRepeat(ch, Math.max(0, ln - str.length));
}

export function fillWithRightAligned(str: string, ln: number, ch: string): string
{
    return stringRepeat(ch, Math.max(0, ln - str.length)) + str;
}
