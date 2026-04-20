<script setup>
defineProps({
  name: { type: String, required: true },
})
</script>

<template>
  <svg
    v-if="name === 'report'"
    viewBox="0 0 24 24"
    fill="currentColor"
    aria-hidden="true"
  >
    <path d="M7 3.5h10a2.5 2.5 0 0 1 2.5 2.5v12a2.5 2.5 0 0 1-2.5 2.5H7A2.5 2.5 0 0 1 4.5 18V6A2.5 2.5 0 0 1 7 3.5Zm2 5.25a1 1 0 1 0 0 2h6a1 1 0 1 0 0-2H9Zm0 4.25a1 1 0 1 0 0 2h4.5a1 1 0 1 0 0-2H9Z" />
  </svg>

  <svg
    v-else-if="name === 'schedule'"
    viewBox="0 0 24 24"
    fill="currentColor"
    aria-hidden="true"
  >
    <path d="M8 2.75a1.25 1.25 0 0 1 1.25 1.25v.75h5.5V4a1.25 1.25 0 1 1 2.5 0v.75H18A3.25 3.25 0 0 1 21.25 8v9A3.25 3.25 0 0 1 18 20.25H6A3.25 3.25 0 0 1 2.75 17V8A3.25 3.25 0 0 1 6 4.75h.75V4A1.25 1.25 0 0 1 8 2.75ZM5.25 10v7A.75.75 0 0 0 6 17.75h12a.75.75 0 0 0 .75-.75v-7H5.25Zm3.5 2.25h2.5v2.5h-2.5v-2.5Zm4 0h2.5v2.5h-2.5v-2.5Z" />
  </svg>

  <svg
    v-else-if="name === 'archive'"
    viewBox="0 0 24 24"
    fill="currentColor"
    aria-hidden="true"
  >
    <path d="M5.5 3.5h13A2.5 2.5 0 0 1 21 6v1.25A1.75 1.75 0 0 1 19.25 9H4.75A1.75 1.75 0 0 1 3 7.25V6a2.5 2.5 0 0 1 2.5-2.5Z" />
    <path d="M4.5 10.5h15V18a2.5 2.5 0 0 1-2.5 2.5H7A2.5 2.5 0 0 1 4.5 18v-7.5Zm5 2.25a1 1 0 1 0 0 2h5a1 1 0 1 0 0-2h-5Z" />
  </svg>

  <svg
    v-else-if="name === 'messages'"
    viewBox="0 0 24 24"
    fill="currentColor"
    aria-hidden="true"
  >
    <path d="M4.5 5.5A3.5 3.5 0 0 1 8 2h8a3.5 3.5 0 0 1 3.5 3.5v6A3.5 3.5 0 0 1 16 15h-4.7l-3.94 3.28A1.15 1.15 0 0 1 5.5 17.4V15H8a1 1 0 1 0 0-2H5.5v-7.5Zm4 1.5a1 1 0 1 0 0 2h7a1 1 0 1 0 0-2h-7Zm0 3.75a1 1 0 1 0 0 2h4.75a1 1 0 1 0 0-2H8.5Z" />
  </svg>

  <svg
    v-else
    viewBox="0 0 24 24"
    fill="currentColor"
    aria-hidden="true"
  >
    <path d="M12 12.25a4.75 4.75 0 1 0 0-9.5 4.75 4.75 0 0 0 0 9.5Z" />
    <path d="M4.25 19.25c0-3.65 3.35-6.25 7.75-6.25s7.75 2.6 7.75 6.25c0 1.1-.9 2-2 2H6.25a2 2 0 0 1-2-2Z" />
  </svg>
</template>
