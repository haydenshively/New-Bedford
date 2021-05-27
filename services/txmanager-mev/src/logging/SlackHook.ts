import nfetch from 'node-fetch';
import winston from 'winston';
import Transport from 'winston-transport';

export default class SlackHook extends Transport {
  private webhookURL: string;

  constructor(webhookURL: string, opts: winston.transport.TransportStreamOptions | undefined = undefined) {
    super(opts);
    this.webhookURL = webhookURL;
  }

  public log(info: any, callback: () => void): void {
    const payload = { mrkdwn: true, text: info.message };

    const params = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    };
    nfetch(this.webhookURL, params).then(() => callback());
  }
}

module.exports = SlackHook;
