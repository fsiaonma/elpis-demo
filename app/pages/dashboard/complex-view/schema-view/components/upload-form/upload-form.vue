<template>
  <el-drawer
    v-model="isShow"
    direction="rtl"
    :destroy-on-close="true"
    :size="550"
  >
    <template #header>
      <h3>{{ title }}</h3>
    </template>
    <template #default>
      <el-upload
        drag
        :auto-upload="false"
        :limit="1"
        accept=".pdf,.docx,.txt"
        :on-change="onFileChange"
        :on-remove="onFileRemove"
      >
        <div class="upload-form__hint">将简历拖到此处，或点击选择文件</div>
        <template #tip>
          <div class="upload-form__tip">支持 pdf / docx / txt，单文件不超过 10MB</div>
        </template>
      </el-upload>
      <p v-if="errorMessage" class="upload-form__error">{{ errorMessage }}</p>
    </template>
    <template #footer>
      <el-button type="primary" :loading="loading" @click="save">{{ saveBtnText }}</el-button>
    </template>
  </el-drawer>
</template>

<script setup>
import { ref, inject } from 'vue';
import { ElNotification } from 'element-plus';
import $curl from '$elpisCommon/curl.js';

const { api, components } = inject('schemaViewData');

const emit = defineEmits(['command']);

const name = ref('uploadForm');
const isShow = ref(false);
const loading = ref(false);
const title = ref('');
const saveBtnText = ref('');
const selectedFile = ref(null);
const errorMessage = ref('');

const show = () => {
  const { config } = components.value[name.value];

  title.value = config.title;
  saveBtnText.value = config.saveBtnText;
  selectedFile.value = null;
  errorMessage.value = '';
  isShow.value = true;
};

const save = async () => {
  if (loading.value) {
    return;
  }

  if (!selectedFile.value) {
    errorMessage.value = '请选择要上传的简历文件';
    return;
  }

  loading.value = true;
  errorMessage.value = '';

  const formData = new FormData();
  formData.append('file', selectedFile.value);

  const res = await $curl({
    method: 'post',
    url: api.value,
    data: formData,
    errorMessage: '上传失败',
  });

  loading.value = false;

  if (!res || !res.success) {
    errorMessage.value = res?.message || '上传失败';
    return;
  }

  ElNotification({
    title: '上传成功',
    message: '简历已上传',
    type: 'success',
  });

  isShow.value = false;
  emit('command', { event: 'loadTableData' });
};

const onFileChange = (uploadFile) => {
  selectedFile.value = uploadFile.raw ?? null;
  errorMessage.value = '';
};

const onFileRemove = () => {
  selectedFile.value = null;
};

defineExpose({
  name,
  show,
});
</script>

<style scoped>
.upload-form__hint {
  padding: 12px 0;
  color: #374151;
}

.upload-form__tip {
  margin-top: 8px;
  color: #6b7280;
  font-size: 13px;
}

.upload-form__error {
  margin: 12px 0 0;
  color: #b91c1c;
  font-size: 14px;
}
</style>
