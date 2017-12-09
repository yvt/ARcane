/*
 * Copyright (c) 2017 ARcane Developers
 *
 * This file is a part of ARcane. Please read the license text that
 * comes with the source code for use conditions.
 */
export type UIColor = UIRgbColor | UIHsvColor;

export class UIRgbColor
{
    readonly mode: 'rgb' = 'rgb';

    /** The red component of the color in range `[0, 1]`, represented in the non-linear sRGB color space. */
    readonly red: number;

    /** The green component of the color in range `[0, 1]`, represented in the non-linear sRGB color space. */
    readonly green: number;

    /** The blue component of the color in range `[0, 1]`, represented in the non-linear sRGB color space. */
    readonly blue: number;

    /** The alpha component of the color in range `[0, 1]`. */
    readonly alpha: number;

    constructor(red: number, green: number, blue: number, alpha: number)
    {
        this.red = red;
        this.green = green;
        this.blue = blue;
        this.alpha = alpha;
    }

    toRgb(): UIRgbColor { return this; }

    toHsv(): UIHsvColor
    {
        const value = Math.max(this.red, this.green, this.blue);
        if (value <= 0) {
            return new UIHsvColor(0, 0, 0, this.alpha);
        }

        let {red, green, blue, alpha} = this;
        red /= value;
        green /= value;
        blue /= value;

        const min = Math.min(red, green, blue);
        const saturation = 1 - min;

        if (saturation === 0) {
            return new UIHsvColor(0, 0, value, alpha);
        }

        let hue;
        if (red >= 1) {
            if (green >= blue) {
                hue = (green - min) / saturation;
            } else {
                hue = 6 - (blue - min) / saturation;
            }
        } else if (green >= 1) {
            if (blue >= red) {
                hue = 2 + (blue - min) / saturation;
            } else {
                hue = 2 - (red - min) / saturation;
            }
        } else {
            if (red >= green) {
                hue = 4 + (red - min) / saturation;
            } else {
                hue = 4 - (green - min) / saturation;
            }
        }

        return new UIHsvColor(hue, saturation, value, alpha);
    }

    toCss(): string
    {
        const {red, green, blue, alpha} = this;
        return `rgba(${red * 100}%, ${green * 100}%, ${blue * 100}%, ${alpha})`;
    }

    toBgr8(): number
    {
        let {red, green, blue} = this;
        red = Math.round(red * 255);
        green = Math.round(green * 255);
        blue = Math.round(blue * 255);
        return red | (green << 8) | (blue << 16);
    }
}

export class UIHsvColor
{
    readonly mode: 'hsv' = 'hsv';

    /** The hue component of the color in range [0, 6]. */
    readonly hue: number;

    /** The saturation component of the color in range [0, 1]. */
    readonly saturation: number;

    /** The value component of the color in range [0, 1]. */
    readonly value: number;

    readonly alpha: number;

    constructor(hue: number, saturation: number, value: number, alpha: number)
    {
        this.hue = hue;
        this.saturation = saturation;
        this.value = value;
        this.alpha = alpha;
    }

    toRgb(): UIRgbColor
    {
        let {hue, saturation, value} = this;
        hue -= Math.floor(hue / 6) * 6;

        let red = 1 - Math.max(Math.min(hue, 6 - hue, 2) - 1, 0);
        let green = 1 - Math.min(Math.max(Math.abs(hue - 2) - 1, 0), 1);
        let blue = 1 - Math.min(Math.max(Math.abs(hue - 4) - 1, 0), 1);

        red = (red * saturation + (1 - saturation)) * value;
        green = (green * saturation + (1 - saturation)) * value;
        blue = (blue * saturation + (1 - saturation)) * value;

        return new UIRgbColor(red, green, blue, this.alpha);
    }

    toHsv(): UIHsvColor { return this; }
}

