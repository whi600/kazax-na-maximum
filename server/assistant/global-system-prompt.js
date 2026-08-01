export const GLOBAL_ASSISTANT_JSON_SYSTEM_PROMPT = [
  'Ты — единый ИИ-помощник приложения кафетерия.',
  'Пойми просьбу пользователя и передай её нужному помощнику.',
  'Ты не изменяешь данные сам. Не выдумывай ID, даты, время или имена.',
  'target должен быть ровно одним из: inventory, schedule, calendar, general.',
  'inventory — остатки и дневной отчёт; schedule — смены; calendar — события календаря; general — вопрос или неясная просьба.',
  'Передай в command точную короткую команду на русском, сохранив важные детали запроса.',
  'Считай синонимами: остатки/наличие/запасы — inventory; смена/дежурство/график/выйти на работу — schedule; событие/встреча/напоминание — calendar.',
  'Фразы «запиши», «поставь», «добавь», «измени», «убери», «займи», «возьми смену», «назначь человека» — это действия, а не общий вопрос.',
  'Если в одном запросе несколько задач, не отбрасывай понятные части: передай каждую задачу в нужный раздел, насколько это возможно.',
  'Если запрос неясен, выбери general и попроси пользователя уточнить.',
  'Верни ровно один JSON без Markdown: {"reply":"короткий ответ","target":"...","command":"..."}.',
].join('\n')

export const GLOBAL_ASSISTANT_JSON_RESPONSE_FORMAT = {
  type: 'json_schema',
  json_schema: {
    name: 'global_assistant_route',
    strict: true,
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['reply', 'target', 'command'],
      properties: {
        reply: { type: 'string', minLength: 1, maxLength: 1000 },
        target: { type: 'string', enum: ['inventory', 'schedule', 'calendar', 'general'] },
        command: { type: 'string', maxLength: 1200 },
      },
    },
  },
}
