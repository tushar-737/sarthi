/**
 * Headless smoke test for the SAARTHI AI frontend.
 *
 * This mounts the *real* React app in jsdom, pointed at the *real* FastAPI
 * backend through the Vite dev-server proxy, and drives it the way a citizen
 * would: land, ask a question, read the answer, open a service, walk the guided
 * journey, change accessibility settings.
 *
 * It exists because a UI that compiles is not a UI that works. Start the
 * backend on :8000 and `npm run dev` on :5173, then run:
 *
 *   npm run smoke
 *
 * Every assertion below is something the demo depends on.
 */

import { JSDOM } from 'jsdom'
import { createServer } from 'vite'

const BASE = process.env.SMOKE_BASE || 'http://127.0.0.1:5173'

/* ---------------------------------------------------------------- setup --- */

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
  url: `${BASE}/`,
  pretendToBeVisual: true,
})

const { window } = dom
for (const key of [
  'window',
  'document',
  'navigator',
  'history',
  'location',
  'localStorage',
  'HTMLElement',
  'HTMLAnchorElement',
  'HTMLInputElement',
  'HTMLTextAreaElement',
  'Element',
  'Node',
  'Event',
  'MouseEvent',
  'CustomEvent',
  'getComputedStyle',
]) {
  // Node 22 defines `navigator` as a getter, so assign through the descriptor.
  Object.defineProperty(globalThis, key, {
    value: window[key],
    configurable: true,
    writable: true,
  })
}
globalThis.requestAnimationFrame = window.requestAnimationFrame.bind(window)
globalThis.cancelAnimationFrame = window.cancelAnimationFrame.bind(window)
globalThis.IS_REACT_ACT_ENVIRONMENT = false

window.matchMedia = (query) => ({
  matches: false,
  media: query,
  onchange: null,
  addListener: () => {},
  removeListener: () => {},
  addEventListener: () => {},
  removeEventListener: () => {},
  dispatchEvent: () => false,
})
globalThis.matchMedia = window.matchMedia

window.scrollTo = () => {}
window.HTMLElement.prototype.scrollIntoView = () => {}

// jsdom has no speech APIs. SAARTHI must cope — that is part of what we check.

// Relative /api calls go to the dev server, which proxies them to FastAPI.
const nodeFetch = globalThis.fetch
globalThis.fetch = (input, init) => {
  if (typeof input === 'string' && input.startsWith('/')) return nodeFetch(`${BASE}${input}`, init)
  return nodeFetch(input, init)
}
window.fetch = globalThis.fetch

/* ------------------------------------------------------------- utilities --- */

const results = []
let failures = 0

function check(label, condition, detail = '') {
  const ok = Boolean(condition)
  if (!ok) failures += 1
  results.push(`${ok ? '  PASS' : '! FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`)
  return ok
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function waitFor(predicate, timeout = 20000) {
  const started = Date.now()
  while (Date.now() - started < timeout) {
    try {
      if (predicate()) return true
    } catch {
      /* not ready yet */
    }
    await sleep(120)
  }
  return false
}

async function expectEventually(label, predicate, timeout = 20000) {
  return check(label, await waitFor(predicate, timeout))
}

const text = () => window.document.body.textContent || ''
const all = (selector) => [...window.document.querySelectorAll(selector)]
const first = (selector) => window.document.querySelector(selector)

function clickElement(element) {
  if (!element) return false
  element.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }))
  return true
}

/** Click the first element matching `selector` whose text contains `needle`. */
function tryClick(selector, needle) {
  const element = all(selector).find((node) => (node.textContent || '').includes(needle))
  return clickElement(element)
}

async function goto(path) {
  window.history.pushState({}, '', path)
  window.dispatchEvent(new window.Event('popstate'))
  await sleep(250)
}

function setValue(element, value) {
  const proto =
    element instanceof window.HTMLTextAreaElement
      ? window.HTMLTextAreaElement.prototype
      : window.HTMLInputElement.prototype
  Object.getOwnPropertyDescriptor(proto, 'value').set.call(element, value)
  element.dispatchEvent(new window.Event('input', { bubbles: true }))
}

async function typeAndSend(message) {
  const composer = first('#chat-composer')
  if (!composer) return check(`composer available for "${message}"`, false)
  setValue(composer, message)
  await sleep(120)
  const sent =
    tryClick('button', 'भेजें') || tryClick('button[aria-label]', 'Send')
  return check(`sent "${message}"`, sent)
}

/** Flip a settings switch by its visible label (the label sits outside the button). */
function toggleSwitch(labelNeedle) {
  const label = all('p').find((node) => (node.textContent || '').trim() === labelNeedle)
  const id = label?.getAttribute('id')
  const button = id ? first(`button[aria-labelledby="${id}"]`) : null
  return clickElement(button)
}

async function resetConversation() {
  if (!tryClick('button', 'नई बातचीत') && !tryClick('button', 'new conversation')) return false
  await sleep(200)
  const confirmed = tryClick('button', 'पक्का करें') || tryClick('button', 'Confirm')
  await sleep(400)
  return confirmed
}


/* --------------------------------------------------------- speech stubs --- */

/**
 * jsdom ships no Web Speech API, so we provide one that behaves like a browser:
 * it reports interim results, then a final transcript the citizen can check and
 * edit before it is sent. Text-to-speech is stubbed too, which lets the test
 * prove the read-aloud controls appear when a voice exists and disappear when
 * it does not.
 */

window.__heardTranscript = 'मुझे आय प्रमाण पत्र बनवाना है'
window.__spoken = []

class FakeSpeechRecognition {
  constructor() {
    this.lang = ''
    this.continuous = false
    this.interimResults = false
    this.maxAlternatives = 1
    this.timers = []
  }
  start() {
    this.timers.push(setTimeout(() => this.onstart?.(), 0))
    this.timers.push(
      setTimeout(() => {
        const transcript = window.__heardTranscript
        this.onresult?.({
          resultIndex: 0,
          results: [{ 0: { transcript: transcript.slice(0, 8), confidence: 0.5 }, isFinal: false, length: 1 }],
        })
      }, 40),
    )
    this.timers.push(
      setTimeout(() => {
        const transcript = window.__heardTranscript
        this.onresult?.({
          resultIndex: 0,
          results: [{ 0: { transcript, confidence: 0.93 }, isFinal: true, length: 1 }],
        })
        this.onend?.()
      }, 120),
    )
  }
  stop() {
    this.timers.forEach(clearTimeout)
    this.onend?.()
  }
  abort() {
    this.timers.forEach(clearTimeout)
    this.onend?.()
  }
}

class FakeUtterance {
  constructor(text) {
    this.text = text
    this.lang = ''
    this.rate = 1
    this.pitch = 1
    this.volume = 1
    this.voice = null
  }
}

window.SpeechRecognition = FakeSpeechRecognition
window.webkitSpeechRecognition = FakeSpeechRecognition
window.SpeechSynthesisUtterance = FakeUtterance
window.speechSynthesis = {
  speaking: false,
  paused: false,
  pending: false,
  rate: 1,
  pitch: 1,
  volume: 1,
  lang: '',
  voice: null,
  getVoices: () => [
    { name: 'Stub hi-IN', lang: 'hi-IN', voiceURI: 'stub-hi', default: true, localService: true },
    { name: 'Stub en-IN', lang: 'en-IN', voiceURI: 'stub-en', default: false, localService: true },
  ],
  speak(utterance) {
    this.speaking = true
    window.__spoken.push(utterance.text)
    setTimeout(() => {
      utterance.onstart?.()
      setTimeout(() => {
        this.speaking = false
        utterance.onend?.()
      }, 10)
    }, 10)
  },
  cancel() {
    this.speaking = false
  },
  pause() {},
  resume() {},
  addEventListener() {},
  removeEventListener() {},
  dispatchEvent() {
    return false
  },
  onvoiceschanged: null,
}
globalThis.SpeechRecognition = window.SpeechRecognition
globalThis.SpeechSynthesisUtterance = window.SpeechSynthesisUtterance
globalThis.speechSynthesis = window.speechSynthesis

function pressEscape() {
  window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
}

/* ------------------------------------------------------------------ run --- */

const consoleErrors = []
const realError = console.error
console.error = (...args) => {
  const message = args.map(String).join(' ')
  if (/not wrapped in act|Could not parse CSS|Not implemented:/.test(message)) return
  consoleErrors.push(message.slice(0, 240))
  realError(...args)
}

const vite = await createServer({
  configFile: new URL('../vite.config.ts', import.meta.url).pathname,
  server: { middlewareMode: true, hmr: false },
  appType: 'custom',
  logLevel: 'error',
})

try {
  const health = await nodeFetch(`${BASE}/api/health`).then((response) => response.json())
  check('backend reachable through the dev proxy', health?.status === 'ok', `demo_mode=${health?.demo_mode}`)

  await vite.ssrLoadModule('/src/main.tsx')

  /* 1. Landing page ------------------------------------------------------ */
  await expectEventually('landing renders the brand', () => text().includes('SAARTHI AI'))
  check('landing headline is an h1', (first('h1')?.textContent || '').includes('SAARTHI'))
  check('landing has a tap-to-speak control', Boolean(first('button[aria-label*="बोलने"]')))
  check('tap-to-speak is a real button with an accessible name', Boolean(first('button[aria-label*="बोलने"]')?.getAttribute('aria-label')))
  check('landing has a text-input fallback', Boolean(first('#landing-question')))
  check('landing has a language selector', Boolean(first('#language-select')))
  check('landing states it is a prototype', /prototype|प्रोटोटाइप|hackathon|हैकाथॉन/i.test(text()))

  await expectEventually('service categories load', () => all('a[href^="/services/"]').length >= 5)
  check('categories link into services', all('a[href^="/services/"]').length >= 5)

  await expectEventually('suggested questions load', () =>
    all('button').some((node) => /आय प्रमाण पत्र/.test(node.textContent || '')),
  )

  /* 2. Demo scenario 1 — Hindi voice: "मुझे आय प्रमाण पत्र बनवाना है" ---- */
  check('opened the microphone', clickElement(first('button[aria-label*="बोलने"]')))
  await expectEventually('listening overlay opens', () => Boolean(first('[role="dialog"]')))
  const overlay = first('[role="dialog"]')
  check('overlay is modal and labelled', overlay?.getAttribute('aria-modal') === 'true' && Boolean(overlay?.getAttribute('aria-labelledby')))
  await expectEventually('overlay reports that SAARTHI is listening', () =>
    /सुन रहा हूँ|Listening/.test(text()),
  )

  // Escape must close the overlay and release the microphone.
  pressEscape()
  await sleep(200)
  check('Escape closes the listening overlay', !first('[role="dialog"]'))

  // Second attempt: let the stub hear the sentence, then check the transcript.
  // Assertions are scoped to the overlay, because the landing page happens to
  // list the same sentence as a suggested question.
  const dialogText = () => first('[role="dialog"]')?.textContent || ''
  const dialogButtons = (needle) =>
    all('[role="dialog"] button').filter((node) =>
      new RegExp(needle).test(`${node.textContent || ''} ${node.getAttribute('aria-label') || ''}`),
    )

  check('reopened the microphone', clickElement(first('button[aria-label*="बोलने"]')))
  await expectEventually('overlay opens again', () => Boolean(first('[role="dialog"]')))
  await expectEventually('heard transcript is shown for confirmation', () =>
    dialogText().includes('आय प्रमाण पत्र'),
  )
  check(
    'nothing is sent until the citizen confirms',
    window.location.pathname === '/' && Boolean(first('[role="dialog"]')),
  )
  check(
    'transcript can be edited before sending',
    clickElement(dialogButtons('जाँचें|Check what I heard')[0]),
  )
  await sleep(250)
  check('an editable transcript field appears', Boolean(first('[role="dialog"] textarea')))
  check(
    'the field is pre-filled with what was heard',
    (first('[role="dialog"] textarea')?.value || '').includes('आय प्रमाण पत्र'),
  )
  check('transcript is sent after confirmation', clickElement(dialogButtons('भेजें|Send')[0]))

  await expectEventually('voice question opens the conversation', () => window.location.pathname === '/assistant')
  await expectEventually('assistant answers about the income certificate', () =>
    all('input[type="checkbox"]').length > 0,
  )
  check('the listening overlay closed after sending', !first('[role="dialog"]'))
  check(
    'the spoken sentence is shown as the citizen message',
    text().includes('मुझे आय प्रमाण पत्र बनवाना है'),
  )

  const checkboxes = all('input[type="checkbox"]').length
  check('document checklist renders as real checkboxes', checkboxes >= 2, `${checkboxes} items`)

  const portalLinks = all('a[target="_blank"]').map((node) => node.getAttribute('href') || '')
  check(
    'answer links to an official government portal',
    portalLinks.some((href) => /gov\.in|nsdl\.com|utiitsl\.com/.test(href)),
    portalLinks.slice(0, 2).join(', '),
  )
  check(
    'answer states its verification level',
    /सत्यापित आधिकारिक|सामान्य मार्गदर्शन|पुष्टि आवश्यक|Verified official|General guidance/.test(text()),
  )
  check('answer shows a last-verified date', /अंतिम सत्यापन|Last verified/.test(text()))
  check('answer offers a guided journey', Boolean(first('a[href^="/navigator/"]')))
  check('answer carries the disclaimer', /पुष्टि करें|confirm/i.test(text()))
  check(
    'read-aloud is offered for the answer when a voice exists',
    all('button').some((node) => /सुनें|Listen/.test(node.textContent || '')),
  )
  check(
    'read-aloud speaks the short spoken summary, not the whole page',
    clickElement(all('button').find((node) => /यह जवाब सुनें|Listen to this answer/.test(node.textContent || ''))),
  )
  await sleep(300)
  check(
    'speaking is announced and can be stopped',
    window.__spoken.length > 0 && window.__spoken[0].length < 600,
    `spoken ${window.__spoken.length} utterance(s), first is ${window.__spoken[0]?.length ?? 0} chars`,
  )
  check('demo mode is disclosed when active', !health?.demo_mode || /डेमो मोड|Demo Mode/.test(text()))

  const box = first('input[type="checkbox"]')
  clickElement(box)
  await sleep(150)
  check('a document can be ticked off', first('input[type="checkbox"]')?.checked === true)

  /* 3. Demo scenario 2 — English scholarship question -------------------- */
  await resetConversation()
  await goto('/assistant')
  check('sent English scholarship question', await typeAndSend('I need financial help for my college education'))
  await expectEventually('scholarship answer arrives', () => /Scholarship|छात्रवृत्ति/.test(text()))
  check(
    'scholarship answer cites the National Scholarship Portal',
    all('a[target="_blank"]').some((node) => (node.getAttribute('href') || '').includes('scholarships.gov.in')),
  )

  /* 4. Demo scenario 3 — confused user gets guided options --------------- */
  await resetConversation()
  await goto('/assistant')
  await typeAndSend("I don't know which certificate I need")
  await expectEventually('clarification options appear', () => all('button[aria-pressed]').length >= 3)
  const options = all('button[aria-pressed]').map((node) => (node.textContent || '').trim())
  check('SAARTHI asks a clarifying question with options', options.length >= 3, `${options.length} options`)
  clickElement(all('button[aria-pressed]')[0])
  await expectEventually('picking an option returns real guidance', () =>
    all('a[href^="/navigator/"]').length > 0,
  )

  /* 5. Service discovery + search ---------------------------------------- */
  await goto('/services')
  await expectEventually('service list loads', () => all('a[href^="/services/"]').length >= 10)
  const serviceLinks = all('a[href^="/services/"]').length
  check('the whole verified catalogue is browsable', serviceLinks >= 13, `${serviceLinks} links`)

  const search = first('#service-search')
  setValue(search, 'pension')
  await expectEventually('search narrows the results', () => /पेंशन|Pension/i.test(text()))

  /* 6. Service detail ---------------------------------------------------- */
  await goto('/services/income_certificate')
  await expectEventually('service detail loads', () => all('a[target="_blank"]').length > 0)
  check('detail shows eligibility', /पात्र|Eligib/i.test(text()))
  check('detail shows documents', /दस्तावेज़|Documents/i.test(text()))
  check('detail shows how to apply', /आवेदन कैसे|How to apply/i.test(text()))
  check('detail shows important notes', /ज़रूरी बातें|Important/i.test(text()))
  check('detail links to the official portal', Boolean(first('a[target="_blank"]')))
  check('detail offers a guided journey', Boolean(first('a[href^="/navigator/income_certificate"]')))
  check(
    'service detail offers Listen when a voice exists',
    all('button').some((node) => /सुनें|Listen/.test(node.textContent || '')),
  )

  /* 7. Guided journey ---------------------------------------------------- */
  await goto('/navigator/income_certificate')
  await expectEventually('journey loads', () => Boolean(first('[role="progressbar"]')))
  check('journey announces Step X of N', /चरण\s*1\s*\/\s*\d+|Step 1 of \d+/i.test(text()))

  const advanced = tryClick('button', 'आगे बढ़ें') || tryClick('button', 'Continue')
  check('continue button works', advanced)
  await sleep(500)
  check('journey advances to step 2', /चरण\s*2\s*\/|Step 2 of/i.test(text()))
  check(
    'progress is exposed to assistive tech',
    first('[role="progressbar"]')?.getAttribute('aria-valuenow') !== null,
    `aria-valuenow=${first('[role="progressbar"]')?.getAttribute('aria-valuenow')}`,
  )

  await goto('/navigator')
  await expectEventually('journey index lists the saved journey', () =>
    /जहाँ छोड़ा|Continue where/.test(text()),
  )
  check('saved journey is resumable', Boolean(first('a[href="/navigator/income_certificate"]')))

  /* 8. Accessibility settings -------------------------------------------- */
  await goto('/settings')
  await expectEventually('settings render', () => Boolean(first('#state-select')))
  check('only lightweight personalisation is offered (state)', Boolean(first('#state-select')))
  check(
    'settings collects no credentials or identifiers',
    all('input[type="password"], input[type="number"]').length === 0,
  )

  const switches = all('button[role="switch"]')
  check('voice / read-aloud / contrast / motion switches exist', switches.length >= 4, `${switches.length} switches`)
  check(
    'every switch states on/off in words, not colour alone',
    switches.every((node) => node.getAttribute('aria-checked') !== null) &&
      /चालू|बंद|ON|OFF/.test(text()),
  )

  check('read-aloud switch found', toggleSwitch('जवाब पढ़कर सुनाएँ') || toggleSwitch('Read answers aloud'))
  await sleep(200)
  check(
    'read-aloud switch is enabled once a voice exists',
    !first('button[role="switch"][aria-checked="true"][disabled]'),
  )
  check('test-voice button speaks', tryClick('button', 'आवाज़ जाँचें') || tryClick('button', 'Test voice'))
  await sleep(300)
  check('the test sentence was spoken', window.__spoken.some((line) => /नमस्ते|Namaste/.test(line)))

  check('high-contrast switch found', toggleSwitch('उच्च कंट्रास्ट') || toggleSwitch('High contrast'))
  await sleep(250)
  check(
    'high contrast is applied to <html>',
    window.document.documentElement.getAttribute('data-contrast') === 'high',
  )

  tryClick('button', 'A+')
  await sleep(250)
  check(
    'text size is applied to <html>',
    ['large', 'xlarge'].includes(window.document.documentElement.getAttribute('data-text')),
    `data-text=${window.document.documentElement.getAttribute('data-text')}`,
  )

  check('reduced-motion switch found', toggleSwitch('कम गति') || toggleSwitch('Reduced motion'))
  await sleep(250)
  check(
    'reduced motion is applied to <html>',
    window.document.documentElement.getAttribute('data-motion') === 'reduced',
  )

  const stored = window.localStorage.getItem('sarthi.settings') || ''
  check('settings persist for the next visit', /highContrast":true/.test(stored))

  /* 9. Unknown route ----------------------------------------------------- */
  await goto('/this-page-does-not-exist')
  await sleep(400)
  check('unknown route offers a way home', /पेज नहीं मिला|not found/i.test(text()))
  check('unknown route links back to the app', Boolean(first('a[href="/"]')))

  /* 10. Console hygiene --------------------------------------------------- */
  check(
    'no runtime console errors',
    consoleErrors.length === 0,
    consoleErrors.slice(0, 3).join(' | '),
  )
} catch (error) {
  failures += 1
  results.push(`! FAIL  smoke run threw — ${String(error?.stack || error).split('\n').slice(0, 4).join(' ')}`)
} finally {
  await vite.close()
}

console.log('\nSAARTHI AI — frontend smoke test\n')
console.log(results.join('\n'))
const passed = results.filter((line) => line.startsWith('  PASS')).length
console.log(`\n${passed} passed, ${failures} failed\n`)
process.exit(failures === 0 ? 0 : 1)
