<script setup lang="ts">
import {onMounted, ref} from 'vue'

const accounts = ref([])
const transactions = ref([])

onMounted(async () => {
  accounts.value = await window.db.account.list()
  transactions.value = await window.db.transaction.list()
})
</script>

<template>
  <div>
    <h1>Compta</h1>

    <h2>Accounts</h2>
    <ul>
      <li v-for="account in accounts" :key="account.id">
        {{ account.name }} — {{ account.type }}
      </li>
    </ul>

    <h2>Transactions</h2>
    <ul>
      <li v-for="tx in transactions" :key="tx.id">
        {{ tx.label }} — {{ tx.amount }}
      </li>
    </ul>
  </div>
</template>