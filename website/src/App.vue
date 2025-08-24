<template>
  <div class="min-h-screen bg-white">
    <Header />
    
    <main>
      <router-view />
    </main>
    
    <Footer />
  </div>
</template>

<script setup lang="ts">
import Header from './components/Header.vue';
import Footer from './components/Footer.vue';
</script>