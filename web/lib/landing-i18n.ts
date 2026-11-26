// Texts of the home page (components/landing). English at /, Spanish at /es.
// Problems, pricing, FAQ and the final CTA come from lib/freelancers-i18n.ts.
// Client speech stays English on purpose: that is the visitor's situation;
// translations and hints are shown in Spanish (the demo language).

export type LandingLocale = 'en' | 'es'

export const L = {
  en: {
    flow: { clients: 'Your clients speak English', you: 'You read it in your language' },
    demo: { hint: 'Hint during the call', ask: 'Ask AI', click: 'Click the button — that’s how it works in the app.', again: 'Ask again', share: 'Share', videoTitle: 'Watch a real call', videoSub: 'Captions, translation, term hints and Ask AI — right on top of your call.' },
    nav: { how: 'How it works', features: 'Features', pricing: 'Pricing', faq: 'FAQ', download: 'Download free' },
    hero: {
      title1: 'Every client call,',
      title2: 'in your language.',
      sub: 'Live translation, tech-term hints and Ask AI during the call. Notes, tasks and the follow-up email after it.',
      cta: 'Download for Windows, free',
      langs: 'Live translation into 18 languages · 10 calls a month free'
    },
    video: { call: 'Video call · Anna Weber', live: 'LIVE', you: 'You', client: 'Client', lang: 'your language', ask: 'Ask AI' },
    works: '+ Microsoft Teams, Slack and any app with sound',
    problemsSub: 'Most freelancers know this feeling. Minutama was built for it.',
    band: {
      title1: 'Stop guessing.',
      title2: 'Catch every question.',
      checks: ['Every question on screen, in your language', 'Scope, budget and deadlines written down for you', 'An answer ready when you freeze'],
      without: 'Without Minutama',
      with: 'With Minutama'
    },
    steps: {
      title: 'How it works',
      sub: 'Three steps. Nothing to set up in Zoom or Meet.',
      items: [
        { title: 'Start the call', text: 'Join on any app and press Start call — or Minutama asks on its own.' },
        { title: 'Minutama listens', text: 'Live captions in your language, term hints and Ask AI on any line.' },
        { title: 'Get the result', text: 'Notes, tasks with dates and a follow-up email in the client’s language.' }
      ]
    },
    features: [
      { title: 'Live captions in your language', checks: ['Short pieces you can read while the client talks', 'First words of the translation in about half a second', 'Tech terms like Stripe, Docker or API explained in one line'] },
      { title: 'Ask AI when you freeze', checks: ['Click any question the client asked', 'See what it means and a short answer to say', 'You answer in your words — the AI never speaks for you'] },
      { title: 'Notes, tasks and the email — done', checks: ['A clear brief: scope, budget, deadline, open points', 'Tasks with real dates, one click to your calendar', 'A follow-up email written in the client’s language'] }
    ],
    featuresCta: 'Try it on your next call',
    pics: {
      termLine: 'online payments service: cards, subscriptions, invoices',
      askAnswer: 'For a small site Vercel is simpler. Say: “I’d deploy on Vercel with a staging site first — Docker only if you need your own server.”',
      notesTitle: 'Booking site for Anna’s café',
      notesReady: 'Notes ready',
      notes: ['Budget about $2,000, launch in early December', 'Online menu, table bookings, Stripe payments'],
      task: 'Send the estimate',
      due: 'Thu, Nov 26'
    },
    examples: {
      title: 'What it looks like on a real call',
      sub: 'Typical questions from client calls, and what you see on your screen.',
      label: 'Example',
      cards: [
        { who: 'A', role: 'Café owner', q: 'Can you continue from the GitHub repo my nephew started?', a: 'Hint: GitHub repo — where the site’s code is stored.' },
        { who: 'M', role: 'Startup founder', q: 'Would you set up GitHub Actions for the builds?', a: 'Hint: GitHub Actions — builds and checks the code by itself.' },
        { who: 'L', role: 'Agency manager', q: 'Do you charge a fixed price or hourly?', a: 'Ask AI: “Fixed price per milestone, estimate by Friday.”' }
      ],
      facts: [
        ['~0.6 s', 'to the first words of the translation'],
        ['18', 'languages for captions and notes'],
        ['0', 'bots joining your call']
      ] as [string, string][]
    },
    trust: [
      ['No bot joins the call', 'The client sees a normal call'],
      ['Updates by themselves', 'Always the newest version'],
      ['Audio is not stored', 'Notes stay on your computer'],
      ['Real support', 'hello@minutama.com']
    ] as [string, string][],
    faqTitle: 'Questions',
    footer: { privacy: 'Privacy', terms: 'Terms', impressum: 'Impressum', cancel: 'Verträge hier kündigen', mail: 'Email us', download: 'Download', account: 'Your subscription' }
  },
  es: {
    flow: { clients: 'Tus clientes hablan inglés', you: 'Tú lo lees en tu idioma' },
    demo: { hint: 'Pista durante la llamada', ask: 'Ask AI', click: 'Haz clic en el botón — así funciona en la app.', again: 'Preguntar de nuevo', share: 'Compartir', videoTitle: 'Mira una llamada real', videoSub: 'Subtítulos, traducción, pistas de términos y Ask AI — encima de tu llamada.' },
    nav: { how: 'Cómo funciona', features: 'Funciones', pricing: 'Precios', faq: 'Preguntas', download: 'Descargar gratis' },
    hero: {
      title1: 'Cada llamada,',
      title2: 'en tu idioma.',
      sub: 'Traducción en vivo, explicación de términos técnicos y Ask AI durante la llamada. Notas, tareas y el email de seguimiento después.',
      cta: 'Descargar para Windows, gratis',
      langs: 'Traducción en vivo a 18 idiomas · 10 llamadas al mes gratis'
    },
    video: { call: 'Videollamada · Anna Weber', live: 'EN VIVO', you: 'Tú', client: 'Cliente', lang: 'tu idioma', ask: 'Ask AI' },
    works: '+ Microsoft Teams, Slack y cualquier app con sonido',
    problemsSub: 'Casi todos los freelancers lo conocen. Minutama nació para esto.',
    band: {
      title1: 'Deja de adivinar.',
      title2: 'No pierdas ninguna pregunta.',
      checks: ['Cada pregunta en pantalla, en tu idioma', 'Alcance, presupuesto y plazos anotados por ti', 'Una respuesta lista cuando te bloqueas'],
      without: 'Sin Minutama',
      with: 'Con Minutama'
    },
    steps: {
      title: 'Cómo funciona',
      sub: 'Tres pasos. Nada que configurar en Zoom o Meet.',
      items: [
        { title: 'Empieza la llamada', text: 'Entra desde cualquier app y pulsa Start call — o Minutama te lo pregunta.' },
        { title: 'Minutama escucha', text: 'Subtítulos en tu idioma, explicación de términos y Ask AI en cada frase.' },
        { title: 'Recibe el resultado', text: 'Notas, tareas con fechas y un email de seguimiento en el idioma del cliente.' }
      ]
    },
    features: [
      { title: 'Subtítulos en vivo en tu idioma', checks: ['Frases cortas que lees mientras el cliente habla', 'Las primeras palabras traducidas en medio segundo', 'Términos como Stripe, Docker o API explicados en una línea'] },
      { title: 'Ask AI cuando te bloqueas', checks: ['Haz clic en cualquier pregunta del cliente', 'Ve qué significa y una respuesta corta para decir', 'Respondes con tus palabras — la IA nunca habla por ti'] },
      { title: 'Notas, tareas y el email — listos', checks: ['Un brief claro: alcance, presupuesto, plazo, puntos abiertos', 'Tareas con fechas reales, a tu calendario en un clic', 'Un email de seguimiento en el idioma del cliente'] }
    ],
    featuresCta: 'Pruébalo en tu próxima llamada',
    pics: {
      termLine: 'servicio de pagos online: tarjetas, suscripciones, facturas',
      askAnswer: 'Para un sitio pequeño Vercel es más simple. Di: “I’d deploy on Vercel with a staging site first — Docker only if you need your own server.”',
      notesTitle: 'Sitio de reservas para el café de Anna',
      notesReady: 'Notas listas',
      notes: ['Presupuesto de unos $2.000, lanzamiento a principios de diciembre', 'Menú online, reservas de mesa, pagos con Stripe'],
      task: 'Enviar el presupuesto',
      due: 'jue, 26 nov'
    },
    examples: {
      title: 'Así se ve en una llamada real',
      sub: 'Preguntas típicas de clientes y lo que ves en tu pantalla.',
      label: 'Ejemplo',
      cards: [
        { who: 'A', role: 'Dueña de un café', q: 'Can you continue from the GitHub repo my nephew started?', a: 'Pista: repo de GitHub — donde se guarda el código del sitio.' },
        { who: 'M', role: 'Fundador de startup', q: 'Would you set up GitHub Actions for the builds?', a: 'Pista: GitHub Actions — compila y revisa el código solo.' },
        { who: 'L', role: 'Gerente de agencia', q: 'Do you charge a fixed price or hourly?', a: 'Ask AI: “Fixed price per milestone, estimate by Friday.”' }
      ],
      facts: [
        ['~0,6 s', 'hasta las primeras palabras traducidas'],
        ['18', 'idiomas para subtítulos y notas'],
        ['0', 'bots en tu llamada']
      ] as [string, string][]
    },
    trust: [
      ['Ningún bot entra', 'El cliente ve una llamada normal'],
      ['Se actualiza sola', 'Siempre la última versión'],
      ['El audio no se guarda', 'Las notas quedan en tu ordenador'],
      ['Soporte real', 'hello@minutama.com']
    ] as [string, string][],
    faqTitle: 'Preguntas',
    footer: { privacy: 'Privacidad', terms: 'Términos', impressum: 'Impressum', cancel: 'Verträge hier kündigen', mail: 'Escríbenos', download: 'Descargar', account: 'Tu suscripción' }
  }
} as const
