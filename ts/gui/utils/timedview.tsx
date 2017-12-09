/*
 * Copyright (c) 2017 ARcane Developers
 *
 * This file is a part of ARcane. Please read the license text that
 * comes with the source code for use conditions.
 */
import bind from 'bind-decorator';
import * as React from 'react';

export interface TimedViewProps
{
    activeClassName?: string;
    activeStyle?: React.CSSProperties;

    inactiveClassName?: string;
    inactiveStyle?: React.CSSProperties;
}

interface State
{
    active: boolean;
}

export class TimedView extends React.PureComponent<TimedViewProps, State>
{
    private pending: number | null = null;
    private timer: number | null = null;
    private mounted = false;

    constructor(props: TimedViewProps)
    {
        super(props);
        this.state = { active: false };
    }

    componentDidMount(): void
    {
        this.mounted = true;
        if (this.pending != null) {
            this.timer = window.setTimeout(this.handleTimeout, this.pending);
            this.pending = null;
        }
    }

    componentWillUnmount(): void
    {
        this.mounted = false;
        if (this.timer != null) {
            clearTimeout(this.timer);
            this.timer = null;
        }
    }

    activateFor(duration: number): void
    {
        if (this.timer != null) {
            window.clearTimeout(this.timer);
            this.timer = null;
        }
        this.setState({ active: true });
        if (this.mounted) {
            this.timer = window.setTimeout(this.handleTimeout, this.pending);
        } else {
            this.pending = duration;
        }
    }

    @bind
    private handleTimeout(): void
    {
        this.timer = null;
        this.setState({ active: false });
    }

    render()
    {
        const {props} = this;
        const active = this.state.active;
        return <div
            className={active ? props.activeClassName : props.inactiveClassName}
            style={active ? props.activeStyle : props.inactiveStyle}>
            {props.children}
        </div>;
    }
}
