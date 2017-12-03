/*
 * Copyright (c) 2017 ARcane Developers
 *
 * This file is a part of ARcane. Please read the license text that
 * comes with the source code for use conditions.
 */
import bind from 'bind-decorator';
import * as React from 'react';

import { UIColor, UIHsvColor, UIRgbColor } from '../utils/color';
import { Slider } from './slider';

const classNames = require('./colorpicker.less');

export interface ColorPickerProps
{
    value: UIColor;

    className?: string;
    style?: React.CSSProperties;

    onChange: (newValue: UIColor) => void;
}

export class ColorPicker extends React.PureComponent<ColorPickerProps, {}>
{
    constructor(props: ColorPickerProps)
    {
        super(props);
    }

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

    render()
    {
        const {props} = this;
        const hsv = props.value.toHsv();

        const sat1 = new UIHsvColor(hsv.hue, 0, hsv.value, 1).toRgb().toCss();
        const sat2 = new UIHsvColor(hsv.hue, 1, hsv.value, 1).toRgb().toCss();

        const val2 = new UIHsvColor(hsv.hue, hsv.saturation, 1, 1).toRgb().toCss();

        return <div
            className={classNames.picker + ' ' + (props.className || '')}
            style={props.style}>
            <Slider
                value={hsv.hue / 6} onChange={this.handleHueChange}
                trackClassName={classNames.hueSliderTrack} />
            <Slider
                value={hsv.saturation} onChange={this.handleSaturationChange}
                trackStyle={{'background': `linear-gradient(90deg, ${sat1}, ${sat2})`}}
                trackClassName={classNames.track} />
            <Slider
                value={hsv.value} onChange={this.handleValueChange}
                trackStyle={{'background': `linear-gradient(90deg, black, ${val2})`}}
                trackClassName={classNames.track} />
        </div>;
    }
}
