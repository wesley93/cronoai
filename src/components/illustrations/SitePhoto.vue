<script setup lang="ts">
// Miniatura ilustrativa da "foto de obra" anexada ao relato (sem imagens externas).
import type { PhotoKind } from '@/types/domain'

const props = defineProps<{ kind?: PhotoKind; src?: string; caption?: string }>()
const bricks = Array.from({ length: 7 }, (_, row) => Array.from({ length: 8 }, (_, col) => ({ x: col * 20 + (row % 2 ? 10 : 0) - 10, y: 38 + row * 10 })))
const rain = Array.from({ length: 18 }, (_, i) => ({ x: (i * 37) % 160, y: (i * 23) % 40 }))
</script>

<template>
  <figure class="relative overflow-hidden rounded-lg border border-zinc-200 bg-zinc-800 dark:border-zinc-700">
    <img v-if="props.src" :src="props.src" alt="Foto enviada do canteiro" class="h-full w-full object-cover" />
    <svg v-else viewBox="0 0 160 110" class="block h-full w-full" role="img" :aria-label="`Foto de obra: ${props.kind}`">
      <defs>
        <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#64748b" />
          <stop offset="1" stop-color="#94a3b8" />
        </linearGradient>
      </defs>
      <rect width="160" height="110" fill="url(#sky)" />

      <!-- Alvenaria em bloco cerâmico com chuva -->
      <g v-if="props.kind === 'alvenaria'">
        <rect x="0" y="30" width="160" height="80" fill="#9a3412" />
        <g v-for="(row, r) in bricks" :key="r">
          <rect v-for="(b, c) in row" :key="c" :x="b.x" :y="b.y" width="19" height="9" fill="#c2410c" stroke="#7c2d12" stroke-width="0.6" />
        </g>
        <rect x="104" y="30" width="56" height="34" fill="#94a3b8" opacity="0.9" />
        <rect x="0" y="26" width="160" height="5" fill="#a1a1aa" />
        <line v-for="(d, i) in rain" :key="`r${i}`" :x1="d.x" :y1="d.y" :x2="d.x - 3" :y2="d.y + 8" stroke="#e2e8f0" stroke-width="0.8" opacity="0.7" />
        <rect x="10" y="88" width="26" height="14" rx="2" fill="#d4d4d8" />
        <text x="23" y="98" font-size="6" text-anchor="middle" fill="#3f3f46">CP-II</text>
      </g>

      <!-- Estrutura: laje com forma e ferragem -->
      <g v-else-if="props.kind === 'estrutura'">
        <rect x="0" y="62" width="160" height="48" fill="#a8a29e" />
        <rect x="0" y="54" width="160" height="10" fill="#78716c" />
        <g stroke="#b45309" stroke-width="1.4">
          <line v-for="i in 9" :key="`v${i}`" :x1="i * 17" y1="10" :x2="i * 17" y2="56" />
        </g>
        <g stroke="#57534e" stroke-width="0.8">
          <line v-for="i in 8" :key="`h${i}`" x1="0" :y1="62 + i * 6" x2="160" :y2="62 + i * 6" />
          <line v-for="i in 14" :key="`w${i}`" :x1="i * 12" y1="62" :x2="i * 12" y2="110" />
        </g>
        <rect x="120" y="20" width="6" height="40" fill="#facc15" />
        <rect x="96" y="16" width="56" height="5" fill="#facc15" />
      </g>

      <!-- Elétrica: rasgos com eletrodutos e caixas 4x2 -->
      <g v-else-if="props.kind === 'eletrica'">
        <rect x="0" y="0" width="160" height="110" fill="#d6d3d1" />
        <g stroke="#a8a29e" stroke-width="0.6">
          <line v-for="i in 11" :key="i" x1="0" :y1="i * 10" x2="160" :y2="i * 10" />
        </g>
        <path d="M30 0 V60 H90 V110" fill="none" stroke="#f59e0b" stroke-width="5" />
        <path d="M120 0 V48" fill="none" stroke="#f59e0b" stroke-width="5" />
        <rect x="22" y="56" width="16" height="10" fill="#fafafa" stroke="#52525b" />
        <rect x="112" y="46" width="16" height="10" fill="#fafafa" stroke="#52525b" />
      </g>

      <!-- Betoneira -->
      <g v-else-if="props.kind === 'betoneira'">
        <rect x="0" y="80" width="160" height="30" fill="#78716c" />
        <ellipse cx="80" cy="52" rx="34" ry="24" fill="#ea580c" transform="rotate(-18 80 52)" />
        <ellipse cx="62" cy="40" rx="10" ry="7" fill="#27272a" transform="rotate(-18 62 40)" />
        <rect x="70" y="70" width="8" height="18" fill="#3f3f46" />
        <circle cx="56" cy="90" r="7" fill="#18181b" />
        <circle cx="104" cy="90" r="7" fill="#18181b" />
        <text x="122" y="28" font-size="14" fill="#fde047">⚠</text>
      </g>

      <!-- Reboco / piso genérico -->
      <g v-else>
        <rect x="0" y="0" width="160" height="110" fill="#d4d4d8" />
        <rect x="0" y="70" width="160" height="40" fill="#a1a1aa" />
        <g stroke="#71717a" stroke-width="0.7">
          <line v-for="i in 4" :key="i" :x1="i * 40" y1="70" :x2="i * 40 - 10" y2="110" />
        </g>
      </g>

      <rect x="4" y="96" width="62" height="10" rx="2" fill="#000" opacity="0.45" />
      <text x="8" y="103" font-size="5.5" fill="#fff" font-family="monospace">GPS ✓ 23/10 · CronoAI</text>
    </svg>
    <figcaption v-if="props.caption" class="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 px-2 pb-1 pt-4 text-[10px] text-white">{{ props.caption }}</figcaption>
  </figure>
</template>
