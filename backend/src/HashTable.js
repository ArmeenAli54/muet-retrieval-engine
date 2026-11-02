/**
 * Custom Hash Table with Separate Chaining
 * Course: CS-251 Data Structures & Algorithms
 *
 * Implements:
 * - 32-bit FNV-1a Hash Algorithm
 * - Separate Chaining for Collision Resolution
 * - Dynamic Resizing on Load Factor > 0.75
 * - Performance Metrics Tracking (Collisions, Longest Chain, Resizes)
 */

class HashTable {
  constructor(initialCapacity = 16) {
    this.buckets = new Array(initialCapacity).fill(null);
    this.size = 0;
    this.collisions = 0;
    this.resizes = 0;
  }

  // 32-bit FNV-1a Hash Function
  hash(key) {
    let hashValue = 2166136261;
    for (let i = 0; i < key.length; i++) {
      hashValue ^= key.charCodeAt(i);
      hashValue = Math.imul(hashValue, 16777619);
    }
    return hashValue >>> 0;
  }

  // O(1) average lookup
  get(key) {
    const index = this.hash(key) % this.buckets.length;
    let entry = this.buckets[index];
    while (entry) {
      if (entry.key === key) return entry.value;
      entry = entry.next;
    }
    return undefined;
  }

  // O(1) average insertion with separate chaining collision resolution
  set(key, value) {
    const index = this.hash(key) % this.buckets.length;
    let entry = this.buckets[index];

    // Check if key already exists in bucket chain
    while (entry) {
      if (entry.key === key) {
        entry.value = value;
        return false;
      }
      entry = entry.next;
    }

    // New key insertion
    if (this.buckets[index]) {
      this.collisions++;
    }
    this.buckets[index] = { key, value, next: this.buckets[index] };
    this.size++;

    // Dynamic resize when load factor exceeds 0.75
    if (this.size / this.buckets.length > 0.75) {
      this.grow();
    }
    return true;
  }

  // Double bucket capacity and rehash all entries
  grow() {
    const oldBuckets = this.buckets;
    this.buckets = new Array(oldBuckets.length * 2).fill(null);
    this.resizes++;

    for (let entry of oldBuckets) {
      while (entry) {
        const next = entry.next;
        const newIndex = this.hash(entry.key) % this.buckets.length;
        entry.next = this.buckets[newIndex];
        this.buckets[newIndex] = entry;
        entry = next;
      }
    }
  }

  // Iterate over all key-value pairs
  forEach(callback) {
    for (let entry of this.buckets) {
      while (entry) {
        callback(entry.key, entry.value);
        entry = entry.next;
      }
    }
  }

  // Longest chain calculation to verify hash distribution
  getLongestChain() {
    let longest = 0;
    for (let entry of this.buckets) {
      let chain = 0;
      while (entry) {
        chain++;
        entry = entry.next;
      }
      if (chain > longest) longest = chain;
    }
    return longest;
  }

  // Summary statistics
  getStats() {
    return {
      size: this.size,
      bucketCount: this.buckets.length,
      loadFactor: +(this.size / this.buckets.length).toFixed(3),
      collisions: this.collisions,
      longestChain: this.getLongestChain(),
      resizes: this.resizes
    };
  }
}

module.exports = HashTable;
