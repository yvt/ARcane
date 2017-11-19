import * as React from 'react';
import { allocateIdentifier } from '../utils/uniqueid';

export interface RadioListItem<T>
{
    value: T;
    label: string | React.ReactNode;
    key?: string;
}

export interface RadioListProps<T>
{
    items: RadioListItem<T>[];
    comparer?: (x: T, y: T) => boolean;
    value: T;

    className?: string;
    style?: React.CSSProperties;

    onChange: (newValue: T) => void;
}

function defaultComparer<T>(x: T, y: T): boolean
{
    return x == y;
}

export class RadioList<T> extends React.PureComponent<RadioListProps<T>, {}>
{
    private readonly prefix = allocateIdentifier();

    constructor(props: RadioListProps<T>)
    {
        super(props);

        this.handleClick = this.handleClick.bind(this);
    }

    render()
    {
        const {props, prefix} = this;
        const comparer = props.comparer || defaultComparer;
        return <ul className={props.className} style={props.style}>
            {props.items.map((item, i) => <li key={item.key || i}>
                <input
                    type='radio'
                    checked={comparer(item.value, props.value)}
                    value={String(i)}
                    onChange={this.handleClick}
                    id={`${prefix}-${i}`}
                    />
                <label htmlFor={`${prefix}-${i}`}>{item.label}</label>
            </li>)}
        </ul>;
    }

    private handleClick(e: React.FormEvent<HTMLInputElement>): void
    {
        const index = parseInt(e.currentTarget.value, 10);
        this.props.onChange(this.props.items[index].value);
    }
}
