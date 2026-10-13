'use strict';

// All participant-facing wording that needs sign-off lives here, so it can be
// reviewed and changed in one place. Dr. Howell approves all of it.
//
// Rules for anyone editing: plain, calm, peer to peer. No em dashes. Never
// "warrior", "journey", "brave", "battle", "fight", "healing space", cure
// language or toxic positivity. No medical advice.

module.exports = {
  programName: 'Managing and Coping with Cancer-Related Fatigue',

  // PLACEHOLDER: pending Dr. Howell sign-off. Do not replace with real
  // numbers until she has approved the wording.
  notMonitored: {
    pending: true,
    title: 'This app is not monitored in real time',
    body:
      '[Placeholder, pending Dr. Howell sign-off. Short message explaining that ' +
      'nobody watches entries as they come in, and what to do if you need help now.]',
    contacts: '[Placeholder, pending Dr. Howell sign-off. Crisis and emergency contacts.]',
  },

  // Weekly Fatigue and Energy Tracker, from the handout.
  tracker: {
    name: 'Weekly Fatigue and Energy Tracker',
    timesOfDay: [
      { key: 'morning', label: 'Morning' },
      { key: 'afternoon', label: 'Afternoon' },
      { key: 'evening', label: 'Evening' },
    ],
    scoreQuestion: 'Fatigue score',
    // PLACEHOLDER pending Abha: words for each end of the 0 to 10 scale.
    scoreLowLabel: '0',
    scoreHighLabel: '10',
    activityLabel: 'What were you doing?',
    notesLabel: 'Notes or patterns (optional)',
    reflections: [
      { key: 'reflection_most_fatigued', label: 'When did I feel most fatigued this week?' },
      { key: 'reflection_biggest_impact', label: 'Which activity had the biggest impact on my energy?' },
      { key: 'reflection_one_change', label: 'One change I could make next week:' },
    ],
  },

  // Score bands from the handout.
  bands: [
    { key: 'mild', label: 'Mild', min: 0, max: 3 },
    { key: 'moderate', label: 'Moderate', min: 4, max: 6 },
    { key: 'severe', label: 'Severe', min: 7, max: 10 },
  ],

  signInEmail: {
    subject: 'Your Healthville sign-in link',
    text: (link, minutes) =>
      `Hello,\n\nHere is your link to sign in to the Healthville tracker:\n\n${link}\n\n` +
      `The link works once and for the next ${minutes} minutes. If you did not ask for it, ` +
      'you can ignore this email.\n\nHealthville',
  },

  // PLACEHOLDER pending Abha: retention period for tracker data. The draft
  // Privacy Notice says program records are kept for 10 years.
  retentionPeriod: '[Placeholder, pending Abha: retention period]',
};
