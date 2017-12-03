/*
 * Copyright (c) 2017 ARcane Developers
 *
 * This file is a part of ARcane. Please read the license text that
 * comes with the source code for use conditions.
 */
import * as React from "react";

const classNames = require('./purecsspie.less');

export interface PureCssPieProps
{
    value: number;
    className?: string;
    style?: React.CSSProperties;
}

export class PureCssPie extends React.PureComponent<PureCssPieProps, {}>
{
    render()
    {
        const {props} = this;
        const full = { transform: `rotate(${props.value * 360}deg)` };
        const half = { transform: `rotate(${props.value * 180}deg)` };
        return (
            <div className={classNames.pinkie + (props.className || "")} style={props.style}>
                <div className={classNames.part1}><i style={full}></i><i style={half}></i></div>
                <div className={classNames.part2}><div style={half}><s><i style={half}></i></s></div></div>
            </div>
        );
    }
}
