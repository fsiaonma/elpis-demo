<template>
  <img src="./asserts/avatar.png" class="avatar"/>
  <el-dropdown @command="handleUserCommand">
    <span class="username">
      {{userName}}<i class="el-icon-arrow-down el-icon--right"></i>
    </span>
    <template #dropdown>
      <el-dropdown-item command="logout">退出登录</el-dropdown-item>
    </template>
  </el-dropdown>
</template>

<script setup>
import { ref } from 'vue';
const lsNickName = localStorage.getItem('nickname');
const userName = ref(lsNickName ?? '管理员');
const handleUserCommand = function(event) {
  if (event === 'logout') {
    window.location = `http://${window.location.host}/api/auth/logout`;
  }
}
</script>

<style lang="less" scoped>
.avatar {
  margin-right: 12px;
  width: 30px;
  height: 30px;
  border-radius: 50%
}

.username {
  font-size: 16px;
  font-weight: 500;
  cursor: pointer;
  height: 60px;
  line-height: 60px;
  outline: none;
}
</style>