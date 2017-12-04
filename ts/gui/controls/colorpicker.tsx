/*
 * Copyright (c) 2017 ARcane Developers
 *
 * This file is a part of ARcane. Please read the license text that
 * comes with the source code for use conditions.
 */
import bind from 'bind-decorator';
import * as React from 'react';

import { IDisposable } from '../../utils/interfaces';
import { table } from '../../utils/utils';

import { UIColor, UIHsvColor, UIRgbColor } from '../utils/color';
import { Slider } from './slider';
import { RadioList } from './radiolist';
import { Canvas } from '../utils/canvas';
import { MouseRouter } from '../utils/mousecapture';

const classNames = require('./colorpicker.less');
const radioListClassNames = require('./radiolist_styles.less');

export interface ColorPickerProps
{
    value: UIColor;

    className?: string;
    style?: React.CSSProperties;

    onChange: (newValue: UIColor) => void;
}

type Style = 'disc' | 'hsv' | 'rgb';

const STYLE_ITEMS = [{
    value: 'disc' as Style,
    label: 'Disc',
}, {
    value: 'hsv' as Style,
    label: 'Square',
}, {
    value: 'rgb' as Style,
    label: 'RGB',
}]

interface State
{
    style: Style;
}

export class ColorPicker extends React.PureComponent<ColorPickerProps, State>
{
    constructor(props: ColorPickerProps)
    {
        super(props);

        this.state = {
            style: 'disc',
        };
    }

    @bind
    private handleStyleChange(newValue: Style): void { this.setState({ style: newValue }); }

    @bind
    private handleHueChange(newValue: number): void
    {
        const hsv = this.props.value.toHsv();
        this.props.onChange(new UIHsvColor(newValue * 6, hsv.saturation, hsv.value, hsv.alpha));
    }

    @bind
    private handleSaturationChange(newValue: number): void
    {
        const hsv = this.props.value.toHsv();
        this.props.onChange(new UIHsvColor(hsv.hue, newValue, hsv.value, hsv.alpha));
    }

    @bind
    private handleValueChange(newValue: number): void
    {
        const hsv = this.props.value.toHsv();
        this.props.onChange(new UIHsvColor(hsv.hue, hsv.saturation, newValue, hsv.alpha));
    }

    @bind
    private handleRedChange(newValue: number): void
    {
        const rgb = this.props.value.toRgb();
        this.props.onChange(new UIRgbColor(newValue, rgb.green, rgb.blue, rgb.alpha));
    }

    @bind
    private handleGreenChange(newValue: number): void
    {
        const rgb = this.props.value.toRgb();
        this.props.onChange(new UIRgbColor(rgb.red, newValue, rgb.blue, rgb.alpha));
    }

    @bind
    private handleBlueChange(newValue: number): void
    {
        const rgb = this.props.value.toRgb();
        this.props.onChange(new UIRgbColor(rgb.red, rgb.green, newValue, rgb.alpha));
    }

    render()
    {
        const {props, state} = this;
        const hsv = props.value.toHsv();
        const rgb = props.value.toRgb();

        const sat1 = new UIHsvColor(hsv.hue, 0, hsv.value, 1).toRgb().toCss();
        const sat2 = new UIHsvColor(hsv.hue, 1, hsv.value, 1).toRgb().toCss();

        const red1 = new UIRgbColor(0, rgb.green, rgb.blue, 1).toCss();
        const red2 = new UIRgbColor(1, rgb.green, rgb.blue, 1).toCss();
        const green1 = new UIRgbColor(rgb.red, 0, rgb.blue, 1).toCss();
        const green2 = new UIRgbColor(rgb.red, 1, rgb.blue, 1).toCss();
        const blue1 = new UIRgbColor(rgb.red, rgb.green, 0, 1).toCss();
        const blue2 = new UIRgbColor(rgb.red, rgb.green, 1, 1).toCss();

        const val2 = new UIHsvColor(hsv.hue, hsv.saturation, 1, 1).toRgb().toCss();

        const StyleRadioList: new() => RadioList<Style> = RadioList as any;

        return <div
            className={classNames.picker + ' ' + (props.className || '')}
            style={props.style}>
            <StyleRadioList
                items={STYLE_ITEMS}
                value={state.style}
                onChange={this.handleStyleChange}
                className={radioListClassNames.buttonsHorizontal}
                />
            <ColorDisc
                value={hsv}
                onChange={props.onChange}
                style={{display: state.style === 'disc' ? 'block' : 'none'}}
                />
            <SvPlane
                value={hsv}
                onChange={props.onChange}
                style={{display: state.style === 'hsv' ? 'block' : 'none'}}
                />
            <div style={{display: state.style === 'rgb' ? 'block' : 'none'}}>
                <Slider
                    value={rgb.red} onChange={this.handleRedChange}
                    className={classNames.slider}
                    trackStyle={{'background': `linear-gradient(90deg, ${red1}, ${red2})`}}
                    trackClassName={classNames.track} />
                <Slider
                    value={rgb.green} onChange={this.handleGreenChange}
                    className={classNames.slider}
                    trackStyle={{'background': `linear-gradient(90deg, ${green1}, ${green2})`}}
                    trackClassName={classNames.track} />
                <Slider
                    value={rgb.blue} onChange={this.handleBlueChange}
                    className={classNames.slider}
                    trackStyle={{'background': `linear-gradient(90deg, ${blue1}, ${blue2})`}}
                    trackClassName={classNames.track} />
                <hr />
            </div>
            <Slider
                value={hsv.hue / 6} onChange={this.handleHueChange}
                className={classNames.slider}
                trackClassName={classNames.hueSliderTrack} />
            <Slider
                value={hsv.saturation} onChange={this.handleSaturationChange}
                className={classNames.slider}
                trackStyle={{'background': `linear-gradient(90deg, ${sat1}, ${sat2})`}}
                trackClassName={classNames.track} />
            <Slider
                value={hsv.value} onChange={this.handleValueChange}
                className={classNames.slider}
                trackStyle={{'background': `linear-gradient(90deg, black, ${val2})`}}
                trackClassName={classNames.track} />
        </div>;
    }
}

function mapSquareToDisc(v: Float64Array | Float32Array | number[]): void
{
    // http://mathproofs.blogspot.jp/2005/07/mapping-square-to-circle.html
    const x = v[0], y = v[1];
    v[0] = x * Math.sqrt(1 - y * y * 0.5);
    v[1] = y * Math.sqrt(1 - x * x * 0.5);
}

function mapDiscToSquare(v: Float64Array | Float32Array | number[]): void
{
    const x = v[0], y = v[1];
    const t = x**2 - y**2;
    const uu = ((2 + t) - Math.sqrt(Math.max((2 + t)**2 - 8 * x**2, 0))) * 0.5;
    v[0] = Math.sqrt(uu) * Math.sign(x);
    v[1] = Math.sqrt(uu - t) * Math.sign(y);
}

const discImage = table(6, hue => {
    const image = new ImageData(128, 128);
    const {data} = image;
    let i = 0;
    const red = (hue <= 1 || hue == 5) ? 0 : -255;
    const green = (hue >= 1 && hue <= 3) ? 0 : -255;
    const blue = (hue >= 3 && hue <= 5) ? 0 : -255;
    const vec = new Float64Array(2);
    for (let y = 0; y < 128; ++y) {
        for (let x = 0; x < 128; ++x) {
            let u = (x - 64) * (1 / 64);
            let v = (64 - y) * (1 / 64);
            const len = Math.sqrt(u * u + v * v);
            if (len > 1) {
                u *= 1 / len; v *= 1 / len;
            }
            vec[0] = u; vec[1] = v;

            mapDiscToSquare(vec);

            const saturation = vec[0] * 0.5 + 0.5;
            const value = vec[1] * 0.5 + 0.5;

            data[i] = (255 + red * saturation) * value;
            data[i + 1] = (255 + green * saturation) * value;
            data[i + 2] = (255 + blue * saturation) * value;
            data[i + 3] = 255;
            i += 4;
        }
    }
    return image;
});

const ringImage = (() => {
    const hueMap = new Float32Array(17 * 17);
    let i = 0;
    for (let y = 0; y <= 128; y += 8) {
        for (let x = 0; x <= 128; x += 8) {
            let u = x - 64;
            let v = 64 - y;
            hueMap[i++] = (Math.atan2(u, v) * (6 / 2 / Math.PI) + 12) % 6;
        }
    }

    const image = new ImageData(128, 128);
    const {data} = image;
    for (let y = 0; y < 128; y += 8) {
        for (let x = 0; x < 128; x += 8) {
            i = (y * 128 + x) * 4;

            let hue1 = hueMap[(x >> 3) +     (y >> 3) * 17];
            let hue2 = hueMap[(x >> 3) + 1 + (y >> 3) * 17];
            let hue3 = hueMap[(x >> 3) +     ((y >> 3) + 1) * 17];
            let hue4 = hueMap[(x >> 3) + 1 + ((y >> 3) + 1) * 17];

            // Handle the wrap around situation
            const threshold = Math.max(hue1, hue2, hue3, hue4) - 3;
            if (hue1 < threshold) {
                hue1 += 6;
            }
            if (hue2 < threshold) {
                hue2 += 6;
            }
            if (hue3 < threshold) {
                hue3 += 6;
            }
            if (hue4 < threshold) {
                hue4 += 6;
            }

            let i2 = i;
            for (let ly = 0; ly < 8; ++ly) {
                for (let lx = 0; lx < 8; ++lx) {
                    const fx = lx * (1 / 8), fy = ly * (1 / 8);
                    const hue5 = hue1 * (1 - fx) + hue2 * fx;
                    const hue6 = hue3 * (1 - fx) + hue4 * fx;
                    let hue = hue5 * (1 - fy) + hue6 * fy;
                    if (hue >= 6) {
                        hue -= 6;
                    }

                    // More precision on warm colors
                    hue -= hue * Math.max(1 - hue * 0.2, 0) * 0.5;

                    // Smoothen the gradient around yellow, cyan, and magenta
                    hue += (1 - hue) * Math.max(1 - Math.abs(1 - hue), 0) * 0.5;
                    hue += (3 - hue) * Math.max(1 - Math.abs(3 - hue), 0) * 0.5;
                    hue += (5 - hue) * Math.max(1 - Math.abs(5 - hue), 0) * 0.5;

                    data[i2] = 255 * (1 - Math.max(Math.min(hue, 6 - hue, 2) - 1, 0));
                    data[i2 + 1] = 255 * (1 - Math.min(Math.max(Math.abs(hue - 2), 0) - 1, 1));
                    data[i2 + 2] = 255 * (1 - Math.min(Math.max(Math.abs(hue - 4), 0) - 1, 1));
                    data[i2 + 3] = 255;
                    i2 += 4;
                }
                i2 += (128 - 8) * 4;
            }
            i += 4;
        }
    }
    return image;
})();

function renderRing(canvas: HTMLCanvasElement): void
{ canvas.getContext('2d')!.putImageData(ringImage, 0, 0); }

const renderDisc = discImage.map(image => (canvas: HTMLCanvasElement) => {
    canvas.getContext('2d')!.putImageData(image, 0, 0);
});

interface ColorDiscProps
{
    value: UIHsvColor;

    style?: React.CSSProperties;

    onChange: (newValue: UIHsvColor) => void;
}

class ColorDisc extends React.PureComponent<ColorDiscProps, {}>
{
    private box: HTMLDivElement | null = null;
    private router: IDisposable | null = null;

    componentDidMount(): void
    {
        const router = this.router = new MouseRouter<'ring' | 'disc'>(this.box!);
        router.onMouseDown = (e, state) => {
            if (e.which !== 1) {
                return null;
            }

            const uv = [e.clientX, e.clientY];
            this.mapCoord(uv);

            const len = Math.hypot(uv[0], uv[1]);
            if (len < 0.75) {
                state = 'disc';
            } else if (len < 1) {
                state = 'ring';
            } else {
                return null;
            }

            router.onMouseMove!(e, state);
            return state;
        };
        router.onMouseMove = (e, state) => {
            e.preventDefault();

            const uv = [e.clientX, e.clientY];
            this.mapCoord(uv);

            if (state === 'disc') {
                uv[0] /= 0.7;
                uv[1] /= 0.7;
                const len = Math.hypot(uv[0], uv[1]);
                if (len > 1) {
                    uv[0] /= len;
                    uv[1] /= len;
                }
                mapDiscToSquare(uv);

                const saturation = Math.max(Math.min(uv[0] * 0.5 + 0.5, 1), 0);
                const value = Math.max(Math.min(uv[1] * 0.5 + 0.5, 1), 0);

                const hsv = this.props.value;
                this.props.onChange(new UIHsvColor(hsv.hue, saturation, value, hsv.alpha));
            } else if (state === 'ring') {
                if (uv[0] === 0 && uv[1] === 0) {
                    // We don't want a "NaN" color in our code
                    return;
                }
                let hue = (Math.atan2(uv[0], uv[1]) * (6 / 2 / Math.PI) + 12) % 6;

                // The same transformation as `ringImage` does
                hue -= hue * Math.max(1 - hue * 0.2, 0) * 0.5;
                hue += (1 - hue) * Math.max(1 - Math.abs(1 - hue), 0) * 0.5;
                hue += (3 - hue) * Math.max(1 - Math.abs(3 - hue), 0) * 0.5;
                hue += (5 - hue) * Math.max(1 - Math.abs(5 - hue), 0) * 0.5;

                const hsv = this.props.value;
                this.props.onChange(new UIHsvColor(hue, hsv.saturation, hsv.value, hsv.alpha));
            }
        };
    }

    private mapCoord(v: number[]): void
    {
        const bounds = this.box!.getBoundingClientRect();
        v[0] = (v[0] - bounds.left) / bounds.width * 2 - 1;
        v[1] = (v[1] - bounds.top) / bounds.height * 2 - 1;
        v[1] = -v[1];
    }

    componentWillUnmount(): void
    {
        if (this.router) {
            this.router.dispose();
            this.router = null;
        }
    }

    render()
    {
        const {props} = this;
        const hsv = props.value;

        let hue = hsv.hue;
        hue -= Math.floor(hue / 6) * 6;

        let hue1 = Math.floor(hue);
        let hue2 = (hue1 + 1) % 6;
        let hueBlend = hue - hue1;
        if (hue2 == 0) {
            hueBlend = 1 - hueBlend;
            let t = hue1; hue1 = hue2; hue2 = t;
        }

        // The location of the saturation/value knob
        const discLoc = [hsv.saturation * 2 - 1, hsv.value * 2 - 1];
        mapSquareToDisc(discLoc);

        // The location of the hue knob (this is not a linear relation — see also
        // `ringImage` for what is going on here)
        let hueDistorted = hue;
        // Inverse of `hue += (5 - hue) * Math.max(1 - Math.abs(5 - hue), 0) * 0.5;`
        if (Math.abs(hueDistorted - 5) < 1) {
            hueDistorted = 5 - 0.5 * (1 - Math.sqrt(1 + 8 * Math.abs(hueDistorted - 5))) * Math.sign(hueDistorted - 5);
        }
        // Inverse of `hue += (3 - hue) * Math.max(1 - Math.abs(3 - hue), 0) * 0.5;`
        if (Math.abs(hueDistorted - 3) < 1) {
            hueDistorted = 3 - 0.5 * (1 - Math.sqrt(1 + 8 * Math.abs(hueDistorted - 3))) * Math.sign(hueDistorted - 3);
        }
        // Inverse of `hue += (1 - hue) * Math.max(1 - Math.abs(1 - hue), 0) * 0.5;`
        if (Math.abs(hueDistorted - 1) < 1) {
            hueDistorted = 1 - 0.5 * (1 - Math.sqrt(1 + 8 * Math.abs(hueDistorted - 1))) * Math.sign(hueDistorted - 1);
        }
        // Inverse of `hue -= hue * Math.max(1 - hue * 0.2, 0) * 0.5;`
        if (hueDistorted < 5) {
            hueDistorted = Math.sqrt(25 + 40 * hueDistorted) * 0.5 - 2.5;
        }
        const ringX = Math.sin(hueDistorted * (Math.PI * 2 / 6)) * 0.85;
        const ringY = Math.cos(hueDistorted * (Math.PI * 2 / 6)) * 0.85;

        // Must be synchronized with `colorpicker.less`
        const discSize = 170;
        const innerDiscSize = 0.7 * discSize;

        const fullBright = new UIHsvColor(hsv.hue, 1, 1, 1);

        return <div className={classNames.colorDisc} ref={e => {this.box = e;}} style={props.style}>
            <div>
                {
                    renderDisc.map((render, i) => <Canvas
                        key={i}
                        width={128} height={128}
                        onUpdate={renderDisc[i]}
                        style={{opacity: i == hue1 ? 1 : i == hue2 ? hueBlend : 0}}
                        />)
                }
            </div>
            <Canvas
                width={128} height={128}
                onUpdate={renderRing} />
            <div
                className={classNames.colorDiscKnob}
                style={{
                    transform: `translate(${(ringX * 0.5 + 0.5) * discSize}px, ${(ringY * -0.5 + 0.5) * discSize}px)`,
                    backgroundColor: fullBright.toRgb().toCss(),
                }} />
            <div>
                <div
                    className={classNames.colorDiscKnob}
                    style={{
                        transform: `translate(${(discLoc[0] * 0.5 + 0.5) * innerDiscSize}px, ${(discLoc[1] * -0.5 + 0.5) * innerDiscSize}px)`,
                        backgroundColor: hsv.toRgb().toCss(),
                    }} />
            </div>
        </div>;
    }
}

interface SvPlaneProps
{
    value: UIHsvColor;

    style?: React.CSSProperties;

    onChange: (newValue: UIHsvColor) => void;
}

class SvPlane extends React.PureComponent<SvPlaneProps, {}>
{
    private box: HTMLDivElement | null = null;
    private router: IDisposable | null = null;

    componentDidMount(): void
    {
        const router = this.router = new MouseRouter(this.box!);
        router.onMouseDown = (e, state) => {
            if (e.which !== 1) {
                return null;
            }

            const uv = [e.clientX, e.clientY];
            this.mapCoord(uv);


            router.onMouseMove!(e, {});
            return {};
        };
        router.onMouseMove = (e, state) => {
            e.preventDefault();

            const uv = [e.clientX, e.clientY];
            this.mapCoord(uv);

            uv[0] = Math.max(Math.min(uv[0], 1), 0);
            uv[1] = Math.max(Math.min(uv[1], 1), 0);

            const hsv = this.props.value;
            this.props.onChange(new UIHsvColor(hsv.hue, uv[0], uv[1], hsv.alpha));
        };
    }

    private mapCoord(v: number[]): void
    {
        const bounds = this.box!.getBoundingClientRect();
        v[0] = (v[0] - bounds.left) / bounds.width;
        v[1] = (v[1] - bounds.top) / bounds.height;
        v[1] = 1 - v[1];
    }

    componentWillUnmount(): void
    {
        if (this.router) {
            this.router.dispose();
            this.router = null;
        }
    }

    render()
    {
        const {props} = this;
        const hsv = props.value;

        const fullBright = new UIHsvColor(hsv.hue, 1, 1, 1);

        return <div className={classNames.svPlane} ref={e => {this.box = e;}} style={props.style}>
            <div style={{
                backgroundColor: fullBright.toRgb().toCss(),
            }} />
            <div /><div />
            <div
                className={classNames.svPlaneKnob}
                style={{
                    left: `${hsv.saturation * 100}%`,
                    top: `${100 - hsv.value * 100}%`,
                    backgroundColor: hsv.toRgb().toCss(),
                }} />
        </div>;
    }
}

