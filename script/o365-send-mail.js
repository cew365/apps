#!/usr/bin/env node

const fs = require('fs')
const path = require('path')
const puppeteer = require('puppeteer')

const REQUIRED_FIELDS = ['to', 'subject', 'content']
const FIELD_ALIASES = {
  email: 'to',
  recipient: 'to',
  body: 'content',
  message: 'content'
}

function parseArgs(argv) {
  const args = {
    file: null,
    headless: false
  }

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]

    if (arg === '--headless') {
      args.headless = true
      continue
    }

    if (arg === '--file' || arg === '-f') {
      args.file = argv[i + 1]
      i += 1
      continue
    }
  }

  return args
}

function usage() {
  console.log(`
Usage:
  node script/o365-send-mail.js --file /absolute/or/relative/path/to/email.txt [--headless]

TXT format (key: value):
  to: person@example.com
  subject: Hello from Puppeteer
  content: First line of the email body.
    You can continue the content in multiline format.

Notes:
  - The script opens Outlook Web (O365) and waits for you to sign in.
  - Required keys in the txt file: to, subject, content
  - Content can be multiline when following lines are indented with spaces.
`)
}

function parseEmailFile(filePath) {
  const resolvedPath = path.resolve(process.cwd(), filePath)

  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`Email txt file does not exist: ${resolvedPath}`)
  }

  const raw = fs.readFileSync(resolvedPath, 'utf8')
  const lines = raw.split(/\r?\n/)
  const fields = {}

  let currentKey = null

  for (const line of lines) {
    if (!line.trim()) {
      if (currentKey === 'content') {
        fields.content = `${fields.content || ''}\n`
      }
      continue
    }

    const fieldMatch = line.match(/^([a-zA-Z][a-zA-Z0-9_-]*)\s*:\s*(.*)$/)

    if (fieldMatch) {
      const rawKey = fieldMatch[1].toLowerCase()
      const key = FIELD_ALIASES[rawKey] || rawKey
      const value = fieldMatch[2]
      fields[key] = value
      currentKey = key
      continue
    }

    // Support multiline values for the current key when line is indented.
    if (currentKey && /^\s+/.test(line)) {
      fields[currentKey] = `${fields[currentKey] || ''}\n${line.trimStart()}`
      continue
    }

    if (currentKey === 'content') {
      fields.content = `${fields.content || ''}\n${line}`
      continue
    }

    throw new Error(`Invalid line in email txt file: "${line}"`)
  }

  for (const field of REQUIRED_FIELDS) {
    if (!fields[field] || !String(fields[field]).trim()) {
      throw new Error(`Missing required field "${field}" in email txt file`)
    }
  }

  return {
    to: String(fields.to).trim(),
    subject: String(fields.subject),
    content: String(fields.content)
  }
}

async function waitForAnySelector(page, selectors, timeout) {
  const deadline = Date.now() + timeout

  while (Date.now() < deadline) {
    for (const selector of selectors) {
      const handle = await page.$(selector)
      if (handle) {
        await handle.dispose()
        return selector
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 400))
  }

  throw new Error(`Could not find any selector in ${timeout}ms: ${selectors}`)
}

async function clickFirstVisible(page, selectors) {
  for (const selector of selectors) {
    const element = await page.$(selector)
    if (!element) continue
    try {
      await element.click()
      await element.dispose()
      return true
    } catch (error) {
      await element.dispose()
      continue
    }
  }

  return false
}

async function setInputValue(page, selectors, value) {
  for (const selector of selectors) {
    const input = await page.$(selector)
    if (!input) continue
    await input.click({ clickCount: 3 })
    await page.keyboard.press('Backspace')
    await input.type(value, { delay: 15 })
    await input.dispose()
    return true
  }

  return false
}

async function setBody(page, selectors, value) {
  for (const selector of selectors) {
    const bodyEl = await page.$(selector)
    if (!bodyEl) continue
    await bodyEl.click()
    await page.keyboard.down('Control')
    await page.keyboard.press('KeyA')
    await page.keyboard.up('Control')
    await page.keyboard.press('Backspace')
    await page.keyboard.type(value, { delay: 8 })
    await bodyEl.dispose()
    return true
  }

  return false
}

async function composeAndSendEmail(page, emailData) {
  await waitForAnySelector(
    page,
    [
      '[aria-label="New mail"]',
      'button[aria-label="New mail"]',
      '[data-automationid="newMailButton"]'
    ],
    120000
  )

  const clickedNew = await clickFirstVisible(page, [
    '[aria-label="New mail"]',
    'button[aria-label="New mail"]',
    '[data-automationid="newMailButton"]'
  ])

  if (!clickedNew) {
    throw new Error('Could not click the "New mail" button')
  }

  await waitForAnySelector(
    page,
    [
      'div[aria-label="To"] input',
      'input[aria-label^="To"]',
      'input[placeholder="Add recipients"]'
    ],
    45000
  )

  const toSet = await setInputValue(
    page,
    [
      'div[aria-label="To"] input',
      'input[aria-label^="To"]',
      'input[placeholder="Add recipients"]'
    ],
    emailData.to
  )
  if (!toSet) throw new Error('Could not set recipient field')

  await page.keyboard.press('Enter')
  await new Promise((resolve) => setTimeout(resolve, 250))

  const subjectSet = await setInputValue(
    page,
    [
      'input[aria-label="Add a subject"]',
      'input[placeholder="Add a subject"]',
      'input[aria-label*="Subject"]'
    ],
    emailData.subject
  )
  if (!subjectSet) throw new Error('Could not set subject field')

  const bodySet = await setBody(
    page,
    [
      'div[aria-label="Message body"]',
      'div[contenteditable="true"][role="textbox"]'
    ],
    emailData.content
  )
  if (!bodySet) throw new Error('Could not set message body')

  const sent = await clickFirstVisible(page, [
    '[aria-label="Send"]',
    'button[aria-label="Send"]',
    'button[title="Send"]'
  ])

  if (!sent) throw new Error('Could not click send button')

  console.log('Email was sent.')
}

async function main() {
  const args = parseArgs(process.argv.slice(2))

  if (!args.file) {
    usage()
    process.exitCode = 1
    return
  }

  const emailData = parseEmailFile(args.file)

  const browser = await puppeteer.launch({
    headless: args.headless,
    defaultViewport: null,
    args: ['--start-maximized']
  })

  const page = await browser.newPage()
  page.setDefaultTimeout(45000)
  page.setDefaultNavigationTimeout(90000)

  try {
    await page.goto('https://outlook.office.com/mail/', {
      waitUntil: 'domcontentloaded'
    })

    console.log(
      'Sign in to your O365 account if prompted. Waiting for inbox elements...'
    )
    await composeAndSendEmail(page, emailData)
  } finally {
    if (args.headless) {
      await browser.close()
    } else {
      console.log('Press Ctrl+C to exit and close the browser.')
    }
  }
}

main().catch((error) => {
  console.error(`Error: ${error.message}`)
  process.exitCode = 1
})
