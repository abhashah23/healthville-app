'use strict';

const nodemailer = require('nodemailer');
const config = require('./config');

let transport = null;
// In tests, sent messages are kept here instead of being sent.
const outbox = [];

function getTransport() {
  if (!transport) {
    transport = nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.port === 465,
      requireTLS: config.smtp.port !== 465,
      auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.pass } : undefined,
    });
  }
  return transport;
}

async function send({ to, subject, text }) {
  if (config.isTest) {
    outbox.push({ to, subject, text });
    return;
  }
  if (!config.smtp.host) {
    // Development only: print instead of sending.
    console.log(`\n--- Email to ${to} ---\n${subject}\n\n${text}\n---\n`);
    return;
  }
  await getTransport().sendMail({ from: config.emailFrom, to, subject, text });
}

module.exports = { send, outbox };
