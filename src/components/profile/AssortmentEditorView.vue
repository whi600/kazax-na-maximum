<script setup>
import { ArrowLeft, Check, Pencil, Trash2 } from 'lucide-vue-next'

defineProps({
  products: { type: Array, default: () => [] },
  form: { type: Object, required: true },
  editingProductId: { type: [Number, null], default: null },
  busy: { type: Boolean, default: false },
  editorsLabel: { type: String, default: '' },
  lastChangedLabel: { type: String, default: '' },
})

const emit = defineEmits([
  'back',
  'update-field',
  'save',
  'reset',
  'edit-product',
  'remove-product',
])
</script>

<template>
  <section class="bg-white border border-slate-100 rounded-lg p-4 shadow-sm space-y-3">
    <button
      type="button"
      @click="emit('back')"
      class="text-[10px] font-black uppercase text-slate-500 flex items-center gap-1.5"
    >
      <ArrowLeft class="w-3.5 h-3.5" />
      Назад в профиль
    </button>

    <div
      v-if="editorsLabel"
      class="rounded-lg border border-amber-100 bg-amber-50 text-amber-700 px-3 py-2 text-[10px] font-black uppercase"
    >
      {{ editorsLabel }}
    </div>

    <div
      v-if="lastChangedLabel"
      class="rounded-lg border border-slate-100 bg-slate-50 text-slate-500 px-3 py-2 text-[10px] font-black uppercase"
    >
      {{ lastChangedLabel }}
    </div>

    <div class="grid grid-cols-12 gap-2">
      <input
        :value="form.name"
        type="text"
        placeholder="Название"
        class="col-span-6 bg-slate-50 border border-slate-100 rounded-lg px-2 py-2 text-[11px] font-bold text-slate-800"
        @input="emit('update-field', 'name', $event.target.value)"
      />
      <select
        :value="form.category"
        class="col-span-3 bg-slate-50 border border-slate-100 rounded-lg px-2 py-2 text-[11px] font-bold text-slate-800"
        @change="emit('update-field', 'category', $event.target.value)"
      >
        <option value="bakery">Выпечка</option>
        <option value="pastry">Кондитерка</option>
        <option value="other">Другое</option>
      </select>
      <input
        :value="form.unit"
        type="text"
        placeholder="Ед."
        class="col-span-3 bg-slate-50 border border-slate-100 rounded-lg px-2 py-2 text-[11px] font-bold text-slate-800"
        @input="emit('update-field', 'unit', $event.target.value)"
      />
    </div>

    <div class="flex gap-2">
      <button
        type="button"
        @click="emit('save')"
        :disabled="busy"
        class="flex-1 bg-blue-600 text-white py-2.5 rounded-lg text-[10px] font-black uppercase flex items-center justify-center gap-1.5 active:scale-95 transition-all"
      >
        <Check class="w-3.5 h-3.5" />
        {{ editingProductId ? 'Сохранить' : 'Добавить' }}
      </button>
      <button
        v-if="editingProductId"
        type="button"
        @click="emit('reset')"
        class="bg-slate-100 text-slate-600 px-3 py-2.5 rounded-lg text-[10px] font-black uppercase active:scale-95 transition-all"
      >
        Сброс
      </button>
    </div>

    <div class="max-h-[60vh] overflow-y-auto border border-slate-100 rounded-lg divide-y divide-slate-100">
      <div
        v-for="product in products"
        :key="product.id"
        class="flex items-center gap-2 px-2.5 py-2 bg-white"
      >
        <div class="min-w-0 flex-1">
          <p class="text-[11px] font-black text-slate-800 truncate">{{ product.name }}</p>
          <p class="text-[9px] font-black text-slate-400 uppercase">
            {{ product.category }} • {{ product.unit }}
          </p>
        </div>
        <button
          type="button"
          @click="emit('edit-product', product)"
          class="text-blue-600 p-1.5 rounded-md active:scale-95 transition-all"
          aria-label="Редактировать товар"
        >
          <Pencil class="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          @click="emit('remove-product', product)"
          class="text-red-500 p-1.5 rounded-md active:scale-95 transition-all"
          aria-label="Удалить товар"
        >
          <Trash2 class="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  </section>
</template>
