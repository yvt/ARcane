import { LogManager } from './utils/logger';

const logManager = new LogManager();
if (process.env.NODE_ENV !== 'production') {
    logManager.enableAllTopics();
}

if ('あ'.charCodeAt(0) != 0x3042) {
    throw new Error("The application was loaded with a wrong encoding.");
}

import * as React from "react";
import * as ReactDOM from "react-dom";
import { App } from './gui/app';

ReactDOM.render(
    <App logManager={logManager} />,
    document.getElementById('app-root'),
);