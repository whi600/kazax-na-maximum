<script setup>
import NavIcon from './NavIcon.vue'

defineProps({
  activeTab: { type: String, required: true },
  items: { type: Array, required: true },
})

const emit = defineEmits(['navigate'])
</script>

<template>
  <nav
    class="fixed left-0 right-0 z-[100] px-4 pb-safe nav-safe"
    :style="{ bottom: 'calc(0.35rem + env(safe-area-inset-bottom))' }"
  >
    <div class="max-w-md mx-auto mb-3">
      <div
        class="kof-tabbar"
        :style="{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }"
      >
        <button
          v-for="item in items"
          :key="item.tab"
          class="kof-tabbtn"
          type="button"
          :aria-label="item.label"
          @click="emit('navigate', item.tab)"
        >
          <span
            class="kof-tabbtn__icon"
            :class="{ 'is-active': activeTab === item.tab }"
          >
            <NavIcon :name="item.icon" class="w-6 h-6" />
          </span>
        </button>
      </div>
    </div>
  </nav>
</template>

<style scoped>
.kof-tabbar {
  background: rgba(2, 6, 23, 0.95);
  border-radius: 16px;
  height: 56px;
  padding: 0 8px;
  box-shadow: 0 20px 38px rgba(15, 23, 42, 0.24);
  display: grid;
  position: relative;
  overflow: visible;
}

.kof-tabbtn {
  border: 0;
  background: transparent;
  margin: 0;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.kof-tabbtn__icon {
  width: 44px;
  height: 44px;
  border-radius: 9999px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: #94a3b8;
  transition: transform 190ms ease, color 180ms ease;
  position: relative;
  z-index: 1;
}

.kof-tabbtn__icon.is-active {
  transform: translateY(-8px);
  background-color: #2563eb;
  color: #fff;
}
</style>
