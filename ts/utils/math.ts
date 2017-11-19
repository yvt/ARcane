export function lerp(a: number, b: number, coef: number): number
{
    return a * (1 - coef) + b * coef;
}
