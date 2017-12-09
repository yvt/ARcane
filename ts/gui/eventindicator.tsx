/*
 * Copyright (c) 2017 ARcane Developers
 *
 * This file is a part of ARcane. Please read the license text that
 * comes with the source code for use conditions.
 */
import * as React from "react";

import { TimedView } from './utils/timedview';

const classNames = require('./eventindicator.less');

export interface EventIndicatorProps
{
}

interface State
{
    message: string;
}

export class EventIndicator extends React.PureComponent<EventIndicatorProps, State>
{
    private view: TimedView | null = null;

    constructor(props: EventIndicatorProps)
    {
        super(props);

        this.state = { message: '' };
    }

    display(message: string): void
    {
        this.setState({ message });
        if (this.view) {
            this.view.activateFor(3000);
        }
    }

    render()
    {
        return <TimedView ref={e => {this.view = e;}}
            activeClassName={classNames.active}
            inactiveClassName={classNames.inactive}>
            <span>{ this.state.message }</span>
        </TimedView>;
    }
}
