export const FUNERAL_HOME_SENDER = 'Funeral Home'

export type Message = {
  sender: string
  body: string
}

export type Family = {
  name: string
  status: 'Awaiting reply' | 'New reply' | 'Scheduled'
  messages: Message[]
}

export const SAMPLE_FAMILIES: Family[] = [
  {
    name: 'Mary Smith',
    status: 'Awaiting reply',
    messages: [
      {
        sender: FUNERAL_HOME_SENDER,
        body: 'We are thinking of you and your family. Please know we are here if you need anything.',
      },
    ],
  },
  {
    name: 'James Carter',
    status: 'New reply',
    messages: [
      { sender: FUNERAL_HOME_SENDER, body: 'Just checking in to see how you are doing.' },
      { sender: 'James Carter', body: 'Thank you for checking on us. It means a lot.' },
    ],
  },
  {
    name: 'Linda Williams',
    status: 'Scheduled',
    messages: [{ sender: FUNERAL_HOME_SENDER, body: 'Our thoughts remain with you and your family.' }],
  },
]

export const SECTIONS = ['Overview', 'Inbox', 'Families', 'Schedule', 'Templates', 'Reports', 'Settings'] as const
export type Section = (typeof SECTIONS)[number]

export const FOLLOW_UP_TEMPLATES = [
  { timing: '3 days', title: 'Thank you' },
  { timing: '2 weeks', title: 'Checking in' },
  { timing: '1 month', title: 'Grief resources' },
  { timing: '3 months', title: 'Continued support' },
  { timing: '6 months', title: 'We are here' },
]

export const SETTINGS = [
  { label: 'Dedicated texting number', value: 'Not connected' },
  { label: 'Email notifications', value: 'Not configured' },
  { label: 'Consent tracking', value: 'Pending database integration' },
]
