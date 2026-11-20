// Copy for the freelancer landing page (/freelancers, /es/freelancers, /pt/freelancers).
// Client speech in the demos stays English on purpose: that is the situation
// the visitor is in. Only the visitor's side is translated.

export type Locale = 'en' | 'es' | 'pt'

export interface Copy {
  meta: { title: string; description: string }
  hero: { eyebrow: string; title: string; sub: string; cta: string; mac: string; note: string }
  demo: { asked: string; yourLanguage: string }
  problems: { eyebrow: string; title: string; items: { icon: string; title: string; text: string }[] }
  live: {
    eyebrow: string
    title: string
    sub: string
    call: string
    questions: string
    scope: string
    unclear: string
    you: string
    client: string
    scopeItems: [string, string][]
    unclearItems: string[]
    translations: string[]
  }
  steps: { title: string; items: { title: string; text: string }[] }
  after: { eyebrow: string; title: string; sub: string; tabs: [string, string, string]; note: string }
  compare: { title: string; without: string; with: string; rows: [string, string, string][] }
  trust: { title: string; text: string }[]
  pricing: {
    title: string
    sub: string
    pricesFor: string
    perMonth: string
    forever: string
    popular: string
    free: { name: string; tagline: string; cta: string; features: string[] }
    pro: { name: string; tagline: string; cta: string; features: string[] }
    max: { name: string; tagline: string; cta: string; features: string[] }
    /** {hours} and {price} are filled in by the pricing component. */
    topup: string
  }
  faq: { title: string; items: { q: string; a: string }[] }
  final: { title: string; sub: string; cta: string; macTitle: string; macText: string }
}

const en: Copy = {
  meta: {
    title: 'Never miss what your client asked',
    description:
      'Minutama shows every question your client asks on your screen, in your own language, tracks scope and budget live, and turns the call into a brief, an estimate and a follow-up email. Free for Windows.'
  },
  hero: {
    eyebrow: 'For freelancers on client calls',
    title: 'Never miss what your client asked.',
    sub: 'Minutama listens to your client calls and shows every question on your screen, in your language. After the call you get the brief, the estimate and the follow-up email.',
    cta: 'Download for Windows, free',
    mac: 'Mac waitlist',
    note: '10 calls a month free · no card · no bot joins the call'
  },
  demo: { asked: 'Client asked', yourLanguage: 'Your language:' },
  problems: {
    eyebrow: 'Sound familiar?',
    title: 'Client calls in your second language are hard',
    items: [
      { icon: '⚡', title: 'They talk fast', text: 'Accents, speed, three people at once. You catch most of it and guess the rest.' },
      { icon: '❓', title: 'Terms you half know', text: '“SOW”, “net 30”, “cold start”. You nod and hope it wasn’t important.' },
      { icon: '🧊', title: 'The question you froze on', text: 'A hard technical question, and for a second your English goes blank.' },
      { icon: '📈', title: 'Scope that grows after the call', text: 'You missed one “and also…”, and now your fixed price covers twice the work.' },
      { icon: '💸', title: 'The budget nobody asked about', text: 'The call ends and you realise you never asked about the budget or the deadline.' },
      { icon: '🌙', title: 'An hour of writing afterwards', text: 'Brief, estimate, follow-up email. In your second language, late at night.' }
    ]
  },
  live: {
    eyebrow: 'During the call',
    title: 'Watch it work while the client talks',
    sub: 'Every question becomes a card in your language. Scope, budget and deadlines collect on their own. What is still unclear stays on screen until you ask.',
    call: 'Live call',
    questions: 'Questions',
    scope: 'Scope tracker',
    unclear: 'Still unclear',
    you: 'You',
    client: 'Client',
    scopeItems: [
      ['Deliverable', 'Patient app + admin panel'],
      ['Budget', '$4–5k, fixed price'],
      ['Deadline', 'MVP by 30 June'],
      ['Stack', 'Next.js, Stripe']
    ],
    unclearItems: ['Who provides the designs?', 'How many clinics at launch?'],
    translations: [
      'Can you build both the patient app and the admin panel?',
      'Have you worked with Stripe subscriptions before?'
    ]
  },
  steps: {
    title: 'How it works',
    items: [
      { title: 'Before the call', text: 'Paste the job post or your proposal. Minutama learns the project, so “Lambda” means AWS and “Next” means Next.js.' },
      { title: 'During the call', text: 'Live captions show what the client says, translated into your language. Not sure what to answer? Click Ask AI on any line.' },
      { title: 'After the call', text: 'Get the project brief, a draft estimate with hours, open points to clarify and a follow-up email ready to send.' }
    ]
  },
  after: {
    eyebrow: 'After the call',
    title: 'From call to scoped project in a minute',
    sub: 'Tasks with a deadline (“send the estimate by Friday”) go to your calendar in one click.',
    tabs: ['Project brief', 'Estimate draft', 'Follow-up email'],
    note: 'Example output. Your estimate is a draft you edit before sending.'
  },
  compare: {
    title: 'Before and after Minutama',
    without: 'Without',
    with: 'With Minutama',
    rows: [
      ['Client questions', 'Some get lost in the speed', 'Every question on screen, in your language'],
      ['Hard terms', 'You nod and google later', 'A one-line explanation right on the card'],
      ['Scope and budget', 'Pieced together from memory', 'Tracked live, gaps flagged before the call ends'],
      ['After the call', 'An hour of writing', 'Brief, estimate and email in a minute'],
      ['Next call with them', 'Start from zero', 'Notes and tasks from every call in one place']
    ]
  },
  trust: [
    { title: 'No bot joins the call', text: 'It runs on your computer. The client sees a normal call.' },
    { title: 'You answer, not the AI', text: 'Minutama helps you understand. It never speaks for you.' },
    { title: 'Honest about your data', text: 'Audio is transcribed and not stored by us. Notes stay on your computer.' }
  ],
  pricing: {
    title: 'Fair prices for where you live',
    sub: 'Prices adjust to your country automatically. Same features everywhere.',
    pricesFor: 'Prices for',
    perMonth: '/ month',
    forever: 'forever',
    popular: 'Most popular',
    free: {
      name: 'Free',
      tagline: 'Try it on real client calls.',
      cta: 'Download free',
      features: ['10 calls a month, up to 60 min each', '20 question cards per call, translated', 'Project brief after every call', 'Works with Zoom, Meet, Teams and more']
    },
    pro: {
      name: 'Pro',
      tagline: 'For freelancers with calls every week.',
      cta: 'Start free, upgrade in the app',
      features: ['25 hours of calls a month', 'Up to 200 question cards per call', 'Estimate draft and follow-up email', 'Ask AI on any line of the call', 'Share as PDF, Notion, Slack']
    },
    max: {
      name: 'Pro Max',
      tagline: 'For agencies and people who live in calls.',
      cta: 'Start free, upgrade in the app',
      features: ['100 hours of calls a month', 'Calls up to 5 h each', 'Up to 400 question cards per call', 'Everything in Pro']
    },
    topup: 'Need more in a busy month? Add {hours} hours for {price}. A call in progress is never cut off. No VAT is charged (§ 19 UStG).'
  },
  faq: {
    title: 'Questions',
    items: [
      { q: 'Does Minutama answer for me?', a: 'No. It shows the question and helps you understand it; you answer in your own words. It helps you understand your client and remember what was agreed.' },
      { q: 'Does a bot join the call?', a: 'No. Minutama runs on your Windows computer and hears your microphone and your computer’s sound. The client sees nothing join.' },
      { q: 'Do I need to tell the client?', a: 'Yes, always. Minutama gives you a one-click message for the call chat, like “I use a note-taking tool so I don’t miss anything, is that OK?”. In many countries recording without consent is against the law.' },
      { q: 'Why is the price lower in my country?', a: 'We adjust prices to local purchasing power so freelancers everywhere can afford it. Features and hours are the same in every country.' },
      { q: 'Where does the audio go?', a: 'Short pieces of audio are sent over an encrypted connection to our transcription provider and are not stored by Minutama. Your notes, briefs and transcripts are saved on your computer.' },
      { q: 'Which apps and languages?', a: 'Any call on your computer: Zoom, Google Meet, Teams, Slack, Upwork calls in the browser, WhatsApp and more. Cards can be shown in Spanish, Portuguese, Hindi, Bengali, Urdu, Filipino, Indonesian, Vietnamese, Turkish, Arabic, Polish, Ukrainian and more.' }
    ]
  },
  final: {
    title: 'Your next client call is the best test.',
    sub: 'Install it now, keep it running, and see every question your client asks.',
    cta: 'Download for Windows, free',
    macTitle: 'On a Mac?',
    macText: 'Leave your email and we’ll write once when the Mac app is ready.'
  }
}

const es: Copy = {
  meta: {
    title: 'No vuelvas a perder lo que preguntó tu cliente',
    description:
      'Minutama muestra en tu pantalla cada pregunta de tu cliente, traducida a tu idioma, sigue el alcance y el presupuesto en vivo y convierte la llamada en un brief, un presupuesto y un email de seguimiento. Gratis para Windows.'
  },
  hero: {
    eyebrow: 'Para freelancers en llamadas con clientes',
    title: 'No vuelvas a perder lo que preguntó tu cliente.',
    sub: 'Minutama escucha tus llamadas con clientes y muestra cada pregunta en tu pantalla, en tu idioma. Al terminar recibes el brief, el presupuesto y el email de seguimiento.',
    cta: 'Descargar para Windows, gratis',
    mac: 'Lista de espera para Mac',
    note: '10 llamadas al mes gratis · sin tarjeta · ningún bot entra a la llamada'
  },
  demo: { asked: 'El cliente preguntó', yourLanguage: 'Tu idioma:' },
  problems: {
    eyebrow: '¿Te suena?',
    title: 'Las llamadas en tu segundo idioma son difíciles',
    items: [
      { icon: '⚡', title: 'Hablan rápido', text: 'Acentos, velocidad, tres personas a la vez. Entiendes casi todo y adivinas el resto.' },
      { icon: '❓', title: 'Términos que conoces a medias', text: '“SOW”, “net 30”, “cold start”. Asientes y esperas que no fuera importante.' },
      { icon: '🧊', title: 'La pregunta que te bloqueó', text: 'Una pregunta técnica difícil y, por un segundo, tu inglés se queda en blanco.' },
      { icon: '📈', title: 'El alcance que crece después', text: 'Se te escapó un “y además…”, y ahora tu precio fijo cubre el doble de trabajo.' },
      { icon: '💸', title: 'El presupuesto que nadie preguntó', text: 'La llamada termina y te das cuenta de que no preguntaste por el presupuesto ni la fecha.' },
      { icon: '🌙', title: 'Una hora escribiendo después', text: 'Brief, presupuesto, email de seguimiento. En tu segundo idioma, tarde por la noche.' }
    ]
  },
  live: {
    eyebrow: 'Durante la llamada',
    title: 'Míralo trabajar mientras el cliente habla',
    sub: 'Cada pregunta se convierte en una tarjeta en tu idioma. El alcance, el presupuesto y las fechas se recogen solos. Lo que aún no está claro queda en pantalla hasta que lo preguntes.',
    call: 'Llamada en vivo',
    questions: 'Preguntas',
    scope: 'Alcance',
    unclear: 'Aún sin aclarar',
    you: 'Tú',
    client: 'Cliente',
    scopeItems: [
      ['Entregable', 'App de pacientes + panel admin'],
      ['Presupuesto', '$4–5k, precio fijo'],
      ['Fecha', 'MVP antes del 30 de junio'],
      ['Stack', 'Next.js, Stripe']
    ],
    unclearItems: ['¿Quién hace los diseños?', '¿Cuántas clínicas al lanzar?'],
    translations: [
      '¿Puedes hacer tanto la app de pacientes como el panel de administración?',
      '¿Has trabajado antes con suscripciones de Stripe?'
    ]
  },
  steps: {
    title: 'Cómo funciona',
    items: [
      { title: 'Antes de la llamada', text: 'Pega la oferta o tu propuesta. Minutama aprende el proyecto, así “Lambda” significa AWS y “Next” significa Next.js.' },
      { title: 'Durante la llamada', text: 'Subtítulos en vivo con lo que dice el cliente, traducido a tu idioma. ¿No sabes qué responder? Pulsa Ask AI en cualquier frase.' },
      { title: 'Después de la llamada', text: 'Recibe el brief del proyecto, un presupuesto con horas, los puntos por aclarar y un email de seguimiento listo para enviar.' }
    ]
  },
  after: {
    eyebrow: 'Después de la llamada',
    title: 'De la llamada a un proyecto definido en un minuto',
    sub: 'Las tareas con fecha (“enviar el presupuesto el viernes”) van a tu calendario con un clic.',
    tabs: ['Brief del proyecto', 'Presupuesto', 'Email de seguimiento'],
    note: 'Ejemplo. Tu presupuesto es un borrador que editas antes de enviarlo.'
  },
  compare: {
    title: 'Antes y después de Minutama',
    without: 'Sin',
    with: 'Con Minutama',
    rows: [
      ['Preguntas del cliente', 'Algunas se pierden por la velocidad', 'Cada pregunta en pantalla, en tu idioma'],
      ['Términos difíciles', 'Asientes y lo buscas después', 'Explicación de una línea en la tarjeta'],
      ['Alcance y presupuesto', 'Reconstruido de memoria', 'Seguido en vivo, con lo que falta señalado'],
      ['Después de la llamada', 'Una hora escribiendo', 'Brief, presupuesto y email en un minuto'],
      ['Siguiente llamada', 'Empiezas de cero', 'Notas y tareas de cada llamada en un lugar']
    ]
  },
  trust: [
    { title: 'Ningún bot entra a la llamada', text: 'Funciona en tu computadora. El cliente ve una llamada normal.' },
    { title: 'Respondes tú, no la IA', text: 'Minutama te ayuda a entender. Nunca habla por ti.' },
    { title: 'Honestos con tus datos', text: 'El audio se transcribe y no lo guardamos. Las notas quedan en tu computadora.' }
  ],
  pricing: {
    title: 'Precios justos para donde vives',
    sub: 'Los precios se ajustan a tu país automáticamente. Las mismas funciones en todas partes.',
    pricesFor: 'Precios para',
    perMonth: '/ mes',
    forever: 'para siempre',
    popular: 'El más elegido',
    free: {
      name: 'Gratis',
      tagline: 'Pruébalo en llamadas reales.',
      cta: 'Descargar gratis',
      features: ['10 llamadas al mes, hasta 60 min', '20 tarjetas de preguntas por llamada', 'Brief del proyecto tras cada llamada', 'Funciona con Zoom, Meet, Teams y más']
    },
    pro: {
      name: 'Pro',
      tagline: 'Para freelancers con llamadas cada semana.',
      cta: 'Empieza gratis, mejora en la app',
      features: ['25 horas de llamadas al mes', 'Hasta 200 tarjetas por llamada', 'Presupuesto y email de seguimiento', 'Ask AI en cualquier frase de la llamada', 'Comparte en PDF, Notion, Slack']
    },
    max: {
      name: 'Pro Max',
      tagline: 'Para agencias y quien vive en llamadas.',
      cta: 'Empieza gratis, mejora en la app',
      features: ['100 horas de llamadas al mes', 'Llamadas de hasta 5 h', 'Hasta 400 tarjetas por llamada', 'Todo lo de Pro']
    },
    topup: '¿Un mes con mucho trabajo? Añade {hours} horas por {price}. Una llamada en curso nunca se corta. Sin IVA (§ 19 UStG).'
  },
  faq: {
    title: 'Preguntas',
    items: [
      { q: '¿Minutama responde por mí?', a: 'No. Te muestra la pregunta y te ayuda a entenderla; tú respondes con tus palabras. Te ayuda a entender al cliente y a recordar lo acordado.' },
      { q: '¿Entra un bot a la llamada?', a: 'No. Minutama funciona en tu computadora con Windows y escucha tu micrófono y el sonido del equipo. El cliente no ve nada.' },
      { q: '¿Tengo que avisar al cliente?', a: 'Sí, siempre. Minutama te da un mensaje listo para el chat, como “Uso una herramienta de notas para no perder detalles, ¿te parece bien?”. En muchos países grabar sin consentimiento es ilegal.' },
      { q: '¿Por qué el precio es más bajo en mi país?', a: 'Ajustamos los precios al poder adquisitivo local para que freelancers de todo el mundo puedan pagarlo. Las funciones y las horas son las mismas en todos los países.' },
      { q: '¿A dónde va el audio?', a: 'Pequeños fragmentos de audio se envían cifrados a nuestro proveedor de transcripción y Minutama no los guarda. Tus notas, briefs y transcripciones se guardan en tu computadora.' },
      { q: '¿Qué apps e idiomas?', a: 'Cualquier llamada en tu computadora: Zoom, Google Meet, Teams, Slack, llamadas de Upwork en el navegador, WhatsApp y más. Las tarjetas pueden mostrarse en español, portugués y muchos idiomas más.' }
    ]
  },
  final: {
    title: 'Tu próxima llamada con un cliente es la mejor prueba.',
    sub: 'Instálalo ahora, déjalo abierto y verás cada pregunta que hace tu cliente.',
    cta: 'Descargar para Windows, gratis',
    macTitle: '¿Usas Mac?',
    macText: 'Deja tu email y te escribiremos una vez cuando la app para Mac esté lista.'
  }
}

const pt: Copy = {
  meta: {
    title: 'Nunca mais perca o que seu cliente perguntou',
    description:
      'O Minutama mostra na sua tela cada pergunta do cliente, traduzida para o seu idioma, acompanha escopo e orçamento ao vivo e transforma a chamada em briefing, orçamento e e-mail de follow-up. Grátis para Windows.'
  },
  hero: {
    eyebrow: 'Para freelancers em chamadas com clientes',
    title: 'Nunca mais perca o que seu cliente perguntou.',
    sub: 'O Minutama ouve suas chamadas com clientes e mostra cada pergunta na sua tela, no seu idioma. Depois da chamada você recebe o briefing, o orçamento e o e-mail de follow-up.',
    cta: 'Baixar para Windows, grátis',
    mac: 'Lista de espera para Mac',
    note: '10 chamadas por mês grátis · sem cartão · nenhum bot entra na chamada'
  },
  demo: { asked: 'O cliente perguntou', yourLanguage: 'Seu idioma:' },
  problems: {
    eyebrow: 'Parece familiar?',
    title: 'Chamadas no seu segundo idioma são difíceis',
    items: [
      { icon: '⚡', title: 'Eles falam rápido', text: 'Sotaques, velocidade, três pessoas ao mesmo tempo. Você entende quase tudo e chuta o resto.' },
      { icon: '❓', title: 'Termos que você conhece pela metade', text: '“SOW”, “net 30”, “cold start”. Você concorda e torce para não ser importante.' },
      { icon: '🧊', title: 'A pergunta que te travou', text: 'Uma pergunta técnica difícil e, por um segundo, seu inglês some.' },
      { icon: '📈', title: 'O escopo que cresce depois', text: 'Você perdeu um “e também…”, e agora seu preço fechado cobre o dobro do trabalho.' },
      { icon: '💸', title: 'O orçamento que ninguém perguntou', text: 'A chamada acaba e você percebe que não perguntou o orçamento nem o prazo.' },
      { icon: '🌙', title: 'Uma hora escrevendo depois', text: 'Briefing, orçamento, e-mail de follow-up. No seu segundo idioma, tarde da noite.' }
    ]
  },
  live: {
    eyebrow: 'Durante a chamada',
    title: 'Veja funcionando enquanto o cliente fala',
    sub: 'Cada pergunta vira um cartão no seu idioma. Escopo, orçamento e prazos se organizam sozinhos. O que ainda não está claro fica na tela até você perguntar.',
    call: 'Chamada ao vivo',
    questions: 'Perguntas',
    scope: 'Escopo',
    unclear: 'Ainda não definido',
    you: 'Você',
    client: 'Cliente',
    scopeItems: [
      ['Entrega', 'App de pacientes + painel admin'],
      ['Orçamento', '$4–5k, preço fechado'],
      ['Prazo', 'MVP até 30 de junho'],
      ['Stack', 'Next.js, Stripe']
    ],
    unclearItems: ['Quem faz o design?', 'Quantas clínicas no lançamento?'],
    translations: [
      'Você consegue fazer o app de pacientes e também o painel de administração?',
      'Você já trabalhou com assinaturas no Stripe?'
    ]
  },
  steps: {
    title: 'Como funciona',
    items: [
      { title: 'Antes da chamada', text: 'Cole a vaga ou sua proposta. O Minutama aprende o projeto, então “Lambda” significa AWS e “Next” significa Next.js.' },
      { title: 'Durante a chamada', text: 'Legendas ao vivo com o que o cliente diz, traduzidas para o seu idioma. Não sabe o que responder? Clique em Ask AI em qualquer frase.' },
      { title: 'Depois da chamada', text: 'Receba o briefing do projeto, um orçamento com horas, os pontos a esclarecer e um e-mail de follow-up pronto para enviar.' }
    ]
  },
  after: {
    eyebrow: 'Depois da chamada',
    title: 'Da chamada ao projeto definido em um minuto',
    sub: 'Tarefas com prazo (“enviar o orçamento até sexta”) vão para o seu calendário com um clique.',
    tabs: ['Briefing do projeto', 'Orçamento', 'E-mail de follow-up'],
    note: 'Exemplo. Seu orçamento é um rascunho que você edita antes de enviar.'
  },
  compare: {
    title: 'Antes e depois do Minutama',
    without: 'Sem',
    with: 'Com Minutama',
    rows: [
      ['Perguntas do cliente', 'Algumas se perdem na velocidade', 'Cada pergunta na tela, no seu idioma'],
      ['Termos difíceis', 'Você concorda e pesquisa depois', 'Explicação de uma linha no cartão'],
      ['Escopo e orçamento', 'Montado de memória', 'Acompanhado ao vivo, com lacunas sinalizadas'],
      ['Depois da chamada', 'Uma hora escrevendo', 'Briefing, orçamento e e-mail em um minuto'],
      ['Próxima chamada', 'Começa do zero', 'Notas e tarefas de cada chamada em um lugar']
    ]
  },
  trust: [
    { title: 'Nenhum bot entra na chamada', text: 'Funciona no seu computador. O cliente vê uma chamada normal.' },
    { title: 'Quem responde é você', text: 'O Minutama ajuda você a entender. Ele nunca fala por você.' },
    { title: 'Transparente com seus dados', text: 'O áudio é transcrito e não fica guardado conosco. As notas ficam no seu computador.' }
  ],
  pricing: {
    title: 'Preços justos para onde você mora',
    sub: 'Os preços se ajustam ao seu país automaticamente. Os mesmos recursos em todo lugar.',
    pricesFor: 'Preços para',
    perMonth: '/ mês',
    forever: 'para sempre',
    popular: 'Mais escolhido',
    free: {
      name: 'Grátis',
      tagline: 'Teste em chamadas reais.',
      cta: 'Baixar grátis',
      features: ['10 chamadas por mês, até 60 min', '20 cartões de perguntas por chamada', 'Briefing do projeto após cada chamada', 'Funciona com Zoom, Meet, Teams e mais']
    },
    pro: {
      name: 'Pro',
      tagline: 'Para freelancers com chamadas toda semana.',
      cta: 'Comece grátis, faça upgrade no app',
      features: ['25 horas de chamadas por mês', 'Até 200 cartões por chamada', 'Orçamento e e-mail de follow-up', 'Ask AI em qualquer frase da chamada', 'Compartilhe em PDF, Notion, Slack']
    },
    max: {
      name: 'Pro Max',
      tagline: 'Para agências e quem vive em chamadas.',
      cta: 'Comece grátis, faça upgrade no app',
      features: ['100 horas de chamadas por mês', 'Chamadas de até 5 h', 'Até 400 cartões por chamada', 'Tudo do Pro']
    },
    topup: 'Mês corrido? Adicione {hours} horas por {price}. Uma chamada em andamento nunca é cortada. Sem IVA (§ 19 UStG).'
  },
  faq: {
    title: 'Perguntas',
    items: [
      { q: 'O Minutama responde por mim?', a: 'Não. Ele mostra a pergunta e ajuda você a entendê-la; você responde com suas palavras. Ele ajuda a entender o cliente e lembrar o que foi combinado.' },
      { q: 'Um bot entra na chamada?', a: 'Não. O Minutama roda no seu computador com Windows e ouve seu microfone e o som do computador. O cliente não vê nada entrar.' },
      { q: 'Preciso avisar o cliente?', a: 'Sim, sempre. O Minutama dá uma mensagem pronta para o chat, como “Uso uma ferramenta de anotações para não perder nada, tudo bem?”. Em muitos países gravar sem consentimento é ilegal.' },
      { q: 'Por que o preço é menor no meu país?', a: 'Ajustamos os preços ao poder de compra local para que freelancers de todo lugar possam pagar. Recursos e horas são os mesmos em todos os países.' },
      { q: 'Para onde vai o áudio?', a: 'Pequenos trechos de áudio são enviados criptografados ao nosso provedor de transcrição e não ficam guardados pelo Minutama. Suas notas, briefings e transcrições ficam no seu computador.' },
      { q: 'Quais apps e idiomas?', a: 'Qualquer chamada no seu computador: Zoom, Google Meet, Teams, Slack, chamadas do Upwork no navegador, WhatsApp e mais. Os cartões podem aparecer em português, espanhol e muitos outros idiomas.' }
    ]
  },
  final: {
    title: 'Sua próxima chamada com cliente é o melhor teste.',
    sub: 'Instale agora, deixe aberto e veja cada pergunta que o cliente faz.',
    cta: 'Baixar para Windows, grátis',
    macTitle: 'Usa Mac?',
    macText: 'Deixe seu e-mail e escreveremos uma vez quando o app para Mac estiver pronto.'
  }
}

export const COPY: Record<Locale, Copy> = { en, es, pt }
