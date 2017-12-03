/*
 * Copyright (c) 2017 ARcane Developers
 *
 * This file is a part of ARcane. Please read the license text that
 * comes with the source code for use conditions.
 */
import * as React from 'react';
import { IDisposable } from '../../utils/interfaces';
import { MouseRouter } from '../utils/mousecapture';

const classNames = require('./slider.less');

export interface SliderProps
{
    value: number;

    className?: string;
    style?: React.CSSProperties;

    trackClassName?: string;
    trackStyle?: React.CSSProperties;

    knobClassName?: string;
    knobStyle?: React.CSSProperties;

    onChange: (newValue: number) => void;
}

export class Slider extends React.PureComponent<SliderProps, {}>
{
    private wrapper: HTMLDivElement | null = null;
    private knobRange: HTMLDivElement | null = null;
    private router: IDisposable | null = null;

    constructor(props: SliderProps)
    {
        super(props);
    }

    componentDidMount(): void
    {
        const router = this.router = new MouseRouter(this.wrapper!);
        router.onMouseDown = (e, state) => {
            if (e.which !== 1) {
                return null;
            }
            router.onMouseMove!(e, {});
            return {};
        };
        router.onMouseMove = (e, state) => {
            e.preventDefault();

            const bounds = this.knobRange!.getBoundingClientRect();
            let newValue = (e.clientX - bounds.left) / bounds.width;
            newValue = Math.max(Math.min(newValue, 1), 0);
            this.props.onChange(newValue);
        };
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
        return <div
            className={classNames.slider + ' ' + (props.className || '')}
            style={props.style}
            ref={e => {this.wrapper = e;}}>
            <div className={classNames.track + ' ' + (props.trackClassName || '')} style={props.trackStyle} />
            <div className={classNames.knobRange} ref={e => {this.knobRange = e;}}>
                <div
                    className={classNames.knob + ' ' + (props.knobClassName || '')}
                    style={{...props.knobStyle, left: `${props.value * 100}%`}} />
            </div>
        </div>;
    }
}
