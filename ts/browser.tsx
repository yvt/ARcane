import { LogManager } from './utils/logger';
import { writeBanner } from './devsupport/banner'

const logManager = new LogManager();
if (process.env.NODE_ENV !== 'production') {
    logManager.enableAllTopics();
}

writeBanner();

import * as React from "react";
import * as ReactDOM from "react-dom";
import { App } from './gui/app';

export function main(): void
{
    ReactDOM.render(
        <App logManager={logManager} />,
        document.getElementById('app-root'),
    );
}
