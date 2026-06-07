<template>
  <q-dialog transition-show='fade' transition-hide='fade' ref='dialog'>
    <q-card class='settings-dialog-card'>
      <q-toolbar class='settings-dialog-toolbar'>
        <q-toolbar-title class='text-body1 text-weight-medium'>
          {{ $t('settings') }}
        </q-toolbar-title>
        <q-btn flat round dense icon='close' size='sm' v-close-popup />
      </q-toolbar>

      <q-card-section class='scroll settings-dialog-body'>
        <div class='settings-dialog-layout'>
          <div class='settings-dialog-nav'>
            <q-tabs v-model='tab' vertical dense class='text-teal no-border settings-dialog-tabs'>
              <q-tab
                name='general'
                icon='tune'
                :label="$t('general')"
                class='text-primary'
              />
              <q-tab
                name='editor'
                icon='edit_attributes'
                :label="$t('editor')"
                class='text-amber-10'
              />
              <q-tab
                name='rune'
                icon='star'
                :label="$t('rune')"
                class='text-purple-5'
              />
              <q-tab
                name='echo'
                icon='graphic_eq'
                :label="$t('echo')"
                class='text-teal-5'
              />
              <q-tab
                name='server'
                icon='storage'
                :label="$t('server')"
                class='text-green-7'
              />
            </q-tabs>
          </div>
          <q-separator vertical class='settings-dialog-sep' />
          <div class='settings-dialog-panels'>
            <q-tab-panels
              v-model='tab'
              animated
              swipeable
              vertical
              transition-prev='jump-up'
              transition-next='jump-up'
            >
              <q-tab-panel name='general' class='q-pa-sm'>
                <div class='row items-center no-wrap q-mb-xs panel-title'>
                  <div class='panel-title-bar bg-primary' />
                  <span class='text-subtitle2 text-weight-medium'>{{ $t('general') }}</span>
                </div>
                <q-separator class='q-my-xs' />
                <div>
                  <div class='text-body2 text-weight-medium q-mb-xs setting-item'>
                    {{ $t('language') }}
                  </div>
                  <q-select
                    dense
                    options-dense
                    :value='$t(language)'
                    :options='languageOptions'
                    @input='languageChangeHandler'
                  />
                </div>
                <div>
                  <div class='text-body2 text-weight-medium q-mb-xs setting-item'>
                    {{ $t('theme') }}
                  </div>
                  <q-select
                    dense
                    options-dense
                    :value='$t(theme)'
                    :options='themeOptions'
                    @input='themeChangeHandler'
                  >
                    <template v-slot:after>
                      <q-btn round dense flat size="sm" icon="contact_support" @click="themeHelpHandler" />
                      <q-btn round dense flat size="sm" icon="refresh" @click="refreshThemeFolderHandler" />
                      <q-btn round dense flat size="sm" icon="open_in_new" @click="openThemeFolderHandler" />
                    </template>
                  </q-select>
                </div>
                <q-separator class='q-my-xs' />
                <div>
                  <div class='text-body2 text-weight-medium q-mb-xs setting-item setting-item--row fa-align-center'>
                    <span>{{ $t('openLogFiles') }}</span>
                    <q-btn
                      class='fab-btn'
                      flat
                      round
                      dense
                      size='sm'
                      color='primary'
                      icon='open_in_new'
                      @click='openLogFilesHandler'
                    />
                  </div>
                </div>
                <q-separator class='q-my-xs' />
                <div>
                  <div class='text-body2 text-weight-medium q-mb-xs setting-item setting-item--row fa-align-center'>
                    <span>{{ $t('currentVersion', { version }) }}</span>
                    <q-btn
                      class='fab-btn'
                      flat
                      round
                      dense
                      size='sm'
                      color='primary'
                      icon='cached'
                      @click='checkUpdateHandler'
                    />
                  </div>
                </div>
              </q-tab-panel>

              <q-tab-panel name='editor' class='q-pa-sm'>
                <div class='row items-center no-wrap q-mb-xs panel-title'>
                  <div class='panel-title-bar bg-amber-10' />
                  <span class='text-subtitle2 text-weight-medium'>{{ $t('editor') }}</span>
                </div>
                <q-separator class='q-my-xs' />
                <div>
                  <div class='text-body2 text-weight-medium q-mb-xs setting-item setting-item--row'>
                    <span>{{ $t('markdownOnly') }}</span>
                    <q-toggle
                      :value='markdownOnly'
                      color='amber-10'
                      @input="
                        v => toggleChanged({ key: 'markdownOnly', value: v })
                      "
                    />
                  </div>
                </div>
                <div>
                  <div class='text-body2 text-weight-medium q-mb-xs setting-item setting-item--row'>
                    <span>{{ $t('noteListDenseMode') }}</span>
                    <q-toggle
                      :value='noteListDenseMode'
                      color='amber-10'
                      @input="
                        v => toggleChanged({ key: 'noteListDenseMode', value: v })
                      "
                    />
                  </div>
                </div>
                <q-separator class='q-my-xs' />
                <div>
                  <div class='text-body2 text-weight-medium q-mb-xs setting-item'>
                    <div class='row items-center no-wrap justify-between q-mb-xs'>
                      <span>{{ $t('quickInsertColumns') }}</span>
                      <div class='row items-center no-wrap q-gutter-xs'>
                        <q-badge color='primary' align='middle'>{{ quickInsertColumns }}</q-badge>
                        <span class='text-caption text-grey-6'>默认 6</span>
                      </div>
                    </div>
                    <q-slider
                      :value='quickInsertColumns'
                      :min='4'
                      :max='8'
                      :step='1'
                      label
                      snap
                      color='amber-10'
                      markers
                      @input="value => updateStateAndStore({ quickInsertColumns: value })"
                    />
                    <div class='row justify-between text-caption text-grey-6 q-mt-xs'>
                      <span>4</span>
                      <span>5</span>
                      <span>6</span>
                      <span>7</span>
                      <span>8</span>
                    </div>
                  </div>
                </div>
                <q-separator class='q-my-xs' />
                <div>
                  <div class='text-body2 text-weight-medium q-mb-xs setting-item'>
                    <span>{{ $t('noteOrder') }}</span>
                    <q-select
                      dense
                      options-dense
                      :value='noteOrderType'
                      :options='noteOrderOptions'
                      emit-value
                      map-options
                      @input='noteOrderChangeHandler'
                    />
                  </div>
                </div>
                <!-- ✅ 已移除自动保存选项！不再需要自动保存配置 -->
              </q-tab-panel>

              <q-tab-panel name='server' class='q-pa-sm'>
                <div class='row items-center no-wrap q-mb-xs panel-title'>
                  <div class='panel-title-bar bg-green-7' />
                  <span class='text-subtitle2 text-weight-medium'>{{ $t('server') }}</span>
                </div>
                <q-separator class='q-my-xs' />
                <div>
                  <div class='text-body2 text-weight-medium q-mb-xs setting-item'>
                    <span>{{ $t('imageUploadService') }}</span>
                    <q-select
                      dense
                      options-dense
                      :value='$t(imageUploadService)'
                      :options='imageUploadServiceOptions'
                      @input='imageUploadServiceChangeHandler'
                    >
                    </q-select>
                  </div>
                </div>
                <q-separator class='q-my-xs' />

                <div class='server-section'>
                  <div class='row items-center no-wrap q-mb-xs panel-title q-mt-md'>
                    <div class='panel-title-bar bg-green-7' />
                    <span class='text-subtitle2 text-weight-medium'>{{ $t('cloudSync') }}</span>
                  </div>
                  <q-separator class='q-my-sm server-section-separator' />

                  <!-- 未登录状态 -->
                  <div v-if='!isLoggedIn' class='text-center q-pa-lg'>
                    <q-icon name='cloud_off' size='3rem' color='grey-5' />
                    <div class='text-h6 q-mt-sm text-grey-7'>{{ $t('cloudSyncNotLoggedIn') }}</div>
                    <div class='text-caption text-grey-5 q-mt-xs'>{{ $t('cloudSyncNotLoggedInHint') }}</div>
                    <q-btn
                      class='q-mt-md'
                      color='primary'
                      :label="$t('cloudSyncLogin')"
                      icon='login'
                      unelevated
                      @click='openLoginDialog'
                    />
                  </div>

                  <!-- 已登录状态 -->
                  <div v-else>
                    <div class='cloud-sync-summary q-mb-md'>
                      <div class='cloud-sync-summary__header row items-start justify-between no-wrap q-col-gutter-md'>
                        <div class='col'>
                          <div class='text-body2 text-weight-medium'>{{ accountInfo.displayName || accountInfo.nickname || accountInfo.username || accountInfo.email || $t('cloudSync') }}</div>
                          <div class='text-caption text-grey-6 q-mt-xs'>{{ lastSyncTimeFormatted }}</div>
                        </div>
                        <q-btn
                          flat
                          dense
                          no-caps
                          color='grey-7'
                          icon='logout'
                          :label="$t('cloudSyncLogout')"
                          @click='confirmLogout'
                        />
                      </div>

                      <div class='row q-col-gutter-sm q-mt-sm'>
                        <div class='col-4'>
                          <div class='sync-stat-card'>
                            <div class='text-caption text-grey-6'>{{ $t('cloudSyncPending') }}</div>
                            <div class='text-subtitle1 text-weight-bold text-green-7'>{{ syncStats.pending || 0 }}</div>
                          </div>
                        </div>
                        <div class='col-4'>
                          <div class='sync-stat-card'>
                            <div class='text-caption text-grey-6'>{{ $t('syncing') }}</div>
                            <div class='text-subtitle1 text-weight-bold'>{{ syncStatusText }}</div>
                          </div>
                        </div>
                        <div class='col-4'>
                          <div class='sync-stat-card'>
                            <div class='text-caption text-grey-6'>{{ $t('cloudSync') }}</div>
                            <div class='text-subtitle1 text-weight-bold'>{{ syncStats.synced || 0 }}</div>
                          </div>
                        </div>
                      </div>

                      <div v-if='syncError' class='text-caption text-negative q-mt-sm'>{{ syncError }}</div>

                      <div class='row q-gutter-sm q-mt-md'>
                        <q-btn
                          unelevated
                          color='green-7'
                          icon='cloud_upload'
                          :label="$t('cloudSyncSyncPushOnly')"
                          :loading='isSyncing'
                          @click='doPushOnly'
                        />
                        <q-btn
                          outline
                          color='green-7'
                          icon='cloud_download'
                          :label="$t('cloudSyncSyncPullOnly')"
                          :loading='isSyncing'
                          @click='doPullOnly'
                        />
                      </div>
                    </div>

                    <q-card flat bordered class='q-mb-sm ai-model-default-card' v-if='defaultAiModel'>
                      <q-card-section class='q-pa-sm'>
                        <div class='row items-start no-wrap'>
                          <q-icon
                            name='psychology'
                            size='1.25rem'
                            :color='defaultAiModelStatusColor'
                            class='q-mr-sm q-mt-xs'
                          />
                          <div class='col'>
                            <div class='row items-center no-wrap q-gutter-xs'>
                              <div class='text-body2 text-weight-medium'>{{ defaultAiModel.name }}</div>
                              <q-badge color='positive' outline>{{ $t('aiDefaultModelBadge') }}</q-badge>
                              <q-badge :color='defaultAiModelStatusColor' outline>
                                {{ defaultAiModelStatusLabel }}
                              </q-badge>
                            </div>
                            <div class='text-caption text-grey-6 q-mt-xs'>
                              {{ getAiProviderLabel(defaultAiModel.provider_type) }} · {{ defaultAiModel.model }}
                            </div>
                            <div class='text-caption text-grey-7 q-mt-xs'>{{ defaultAiModel.base_url }}</div>
                            <div
                              class='text-caption q-mt-xs'
                              :class='defaultAiModelUsable ? "text-positive" : "text-warning"'
                            >
                              {{ defaultAiModelStatusHint }}
                            </div>
                            <div
                              v-if='!defaultAiModelUsable && defaultAiModelMissingFieldLabels.length > 0'
                              class='row items-center q-gutter-xs q-mt-sm'
                            >
                              <q-badge
                                v-for='field in defaultAiModelMissingFieldLabels'
                                :key='field'
                                color='warning'
                                outline
                              >
                                {{ field }}
                              </q-badge>
                            </div>
                          </div>
                        </div>
                      </q-card-section>
                    </q-card>

                    <div class='row items-center no-wrap q-mb-xs panel-title q-mt-md'>
                      <div class='panel-title-bar bg-green-7' />
                      <span class='text-subtitle2 text-weight-medium'>{{ $t('aiModelSettings') }}</span>
                      <q-space />
                      <q-btn
                        dense flat no-caps
                        color='green-7'
                        icon='add'
                        size='sm'
                        :label="$t('aiModelAdd')"
                        @click='openAiModelDialog()'
                      />
                    </div>
                    <q-separator class='q-my-sm server-section-separator' />

                    <div v-if='aiModelsLoading' class='row items-center text-grey-6 q-py-md'>
                      <q-spinner size='20px' class='q-mr-sm' />
                      <span>{{ $t('loading') }}</span>
                    </div>

                    <div v-else-if='aiModelConfigs.length === 0' class='text-center text-grey q-pa-md ai-model-empty'>
                      <q-icon name='smart_toy' size='2rem' />
                      <div class='q-mt-sm'>{{ $t('aiNoModelConfigured') }}</div>
                    </div>

                    <div v-else class='column q-gutter-sm q-mb-md'>
                      <q-card
                        v-for='item in aiModelConfigs'
                        :key='item.id'
                        flat
                        bordered
                        class='ai-model-card'
                      >
                        <q-card-section class='q-pa-sm'>
                          <div class='row items-start no-wrap q-col-gutter-sm'>
                            <div class='col'>
                              <div class='row items-center no-wrap q-gutter-xs'>
                                <div class='text-body2 text-weight-medium'>{{ item.name }}</div>
                                <q-badge v-if='item.is_default' color='primary' outline>{{ $t('aiDefaultModelBadge') }}</q-badge>
                              </div>
                              <div class='text-caption text-grey-6 q-mt-xs'>{{ getAiProviderLabel(item.provider_type) }}</div>
                              <div class='text-caption text-grey-7 q-mt-xs'>{{ item.base_url }}</div>
                              <div class='text-caption text-grey-7 q-mt-xs'>{{ item.model }}</div>
                              <div class='text-caption text-grey-6 q-mt-xs' v-if='item.hasApiKey'>
                                {{ item.provider_type === 'portkey' ? $t('aiPortkeyApiKey') : $t('aiApiKey') }}: {{ item.apiKeyMasked }}
                              </div>
                              <div class='text-caption text-grey-6 q-mt-xs' v-if='item.hasVirtualKey'>
                                {{ $t('aiPortkeyVirtualKey') }}: {{ item.portkeyVirtualKeyMasked }}
                              </div>
                            </div>
                            <div class='column q-gutter-xs'>
                              <q-btn dense flat no-caps color='primary' size='sm' icon='edit' :label="$t('aiModelEdit')" @click='openAiModelDialog(item.id)' />
                              <q-btn
                                v-if='!item.is_default'
                                dense flat no-caps color='positive' size='sm' icon='check_circle'
                                :label="$t('aiSetDefault')"
                                @click='setDefaultAiModel(item)'
                              />
                              <q-btn dense flat no-caps color='negative' size='sm' icon='delete' :label="$t('aiModelDelete')" @click='confirmDeleteAiModel(item)' />
                            </div>
                          </div>
                        </q-card-section>
                      </q-card>
                    </div>
                  </div>
                </div>
                <q-separator class='q-my-xs' />
                <div>
                  <div class='text-body2 text-weight-medium q-mb-xs setting-item setting-item--row'>
                    <span>{{ $t('resetSqlite') }}</span>
                    <q-btn
                      class='fab-btn reset-sqlite-btn'
                      flat
                      no-caps
                      color='negative'
                      icon='delete_forever'
                      :label="$t('resetSqlite')"
                      @click='resetSqliteHandler'
                    />
                  </div>
                  <div class='text-caption text-grey-6'>
                    {{ $t('resetSqliteHint') }}
                  </div>
                </div>
              </q-tab-panel>

              <q-tab-panel name='rune' class='q-pa-sm'>
                <div class='row items-center no-wrap q-mb-xs panel-title'>
                  <div class='panel-title-bar bg-purple-5' />
                  <span class='text-subtitle2 text-weight-medium'>{{ $t('runeManagement') }}</span>
                  <q-space />
                  <q-btn
                    dense flat no-caps
                    :label="$t('runeCardAdd')"
                    color='purple-5'
                    icon='add'
                    size='sm'
                    @click='openAddRune'
                  />
                </div>
                <div class='text-caption text-grey-6 q-mb-sm'>
                  <q-icon name='drag_indicator' size='xs' /> {{ $t('runeDragTip') }}
                </div>
                <q-separator class='q-my-xs' />
                <div class='rune-grid'>
                  <div
                    v-for='(rune, index) in localRuneCards'
                    :key='rune.id'
                    draggable='true'
                    class='rune-card-wrapper'
                    @dragstart='onDragStart($event, index, "rune")'
                    @dragover.prevent='onDragOver($event, index, "rune")'
                    @drop='onDrop($event, index, "rune")'
                    @dragend='onDragEnd($event, "rune")'
                  >
                    <RuneCard
                      class='rune-card-item'
                      :rune='rune'
                      @edit='openEditRune'
                      @delete='confirmDeleteRune'
                    />
                  </div>
                </div>
                <div v-if='!localRuneCards || localRuneCards.length === 0' class='text-center text-grey q-pa-xl'>
                  <q-icon name='star' size='3rem' />
                  <div class='q-mt-sm'>{{ $t('runeCardAdd') }}</div>
                </div>
              </q-tab-panel>

              <q-tab-panel name='echo' class='q-pa-sm'>
                <div class='row items-center no-wrap q-mb-xs panel-title'>
                  <div class='panel-title-bar bg-teal-5' />
                  <span class='text-subtitle2 text-weight-medium'>{{ $t('echoManagement') }}</span>
                  <q-space />
                  <q-btn
                    dense flat no-caps
                    :label="$t('echoCardAdd')"
                    color='teal-5'
                    icon='add'
                    size='sm'
                    @click='openAddEcho'
                  />
                </div>
                <div class='text-caption text-grey-6 q-mb-sm'>
                  <q-icon name='drag_indicator' size='xs' /> {{ $t('echoDragTip') }}
                </div>
                <q-separator class='q-my-xs' />
                <div class='rune-grid'>
                  <div
                    v-for='(echo, index) in localEchoCards'
                    :key='echo.id'
                    draggable='true'
                    class='rune-card-wrapper echo-card-wrapper'
                    @dragstart='onDragStart($event, index, "echo")'
                    @dragover.prevent='onDragOver($event, index, "echo")'
                    @drop='onDrop($event, index, "echo")'
                    @dragend='onDragEnd($event, "echo")'
                  >
                    <RuneCard
                      class='rune-card-item'
                      :rune='echo'
                      :name-label="$t('echoCardName')"
                      :desc-label="$t('echoCardDesc')"
                      :power-label="$t('echoCardPower')"
                      :edit-label="$t('echoCardEdit')"
                      :delete-label="$t('echoCardDelete')"
                      @edit='openEditEcho'
                      @delete='confirmDeleteEcho'
                    />
                  </div>
                </div>
                <div v-if='!localEchoCards || localEchoCards.length === 0' class='text-center text-grey q-pa-xl'>
                  <q-icon name='graphic_eq' size='3rem' />
                  <div class='q-mt-sm'>{{ $t('echoCardAdd') }}</div>
                </div>
              </q-tab-panel>


            </q-tab-panels>
          </div>
        </div>
      </q-card-section>
    </q-card>
    <ImageUploadServiceDialog ref='imageUploadServiceDialog' />
    <UpdateDialog ref='updateDialog' />
    <RuneFormDialog
      v-if='runeFormVisible'
      :key='runeFormKey'
      v-model='runeFormVisible'
      :rune='editingRune'
      @input='onRuneFormVisibleChange'
      @submit='onRuneSubmit'
    />
    <EchoFormDialog
      v-if='echoFormVisible'
      :key='echoFormKey'
      v-model='echoFormVisible'
      :echo='editingEcho'
      @input='onEchoFormVisibleChange'
      @submit='onEchoSubmit'
    />

    <q-dialog v-model='aiModelDialogVisible' persistent>
      <q-card class='ai-model-form-card'>
        <q-card-section class='row items-center no-wrap q-pb-sm'>
          <div class='text-subtitle1 text-weight-medium'>{{ aiModelForm.id ? $t('aiModelEdit') : $t('aiModelAdd') }}</div>
          <q-space />
          <q-btn flat round dense icon='close' v-close-popup />
        </q-card-section>

        <q-card-section class='q-pt-none'>
          <q-input
            v-model.trim='aiModelForm.name'
            dense
            outlined
            class='q-mb-sm'
            :label="$t('aiModelConfigName')"
          />
          <q-select
            v-model='aiModelForm.provider_type'
            dense
            outlined
            emit-value
            map-options
            class='q-mb-sm'
            :label="$t('aiProviderType')"
            :options='aiProviderOptions'
          />
          <q-input
            v-model.trim='aiModelForm.base_url'
            dense
            outlined
            class='q-mb-sm'
            :label="$t('aiBaseUrl')"
          />
          <q-input
            v-model.trim='aiModelForm.model'
            dense
            outlined
            class='q-mb-sm'
            :label="$t('aiModelName')"
          />
          <q-input
            v-model.trim='aiModelForm.api_key'
            dense
            outlined
            class='q-mb-sm'
            :type='showAiApiKey ? "text" : "password"'
            :label='isPortkeyProvider ? $t("aiPortkeyApiKey") : $t("aiApiKey")'
            :hint='aiModelApiKeyHint'
          >
            <template v-slot:append>
              <q-btn flat round dense :icon='showAiApiKey ? "visibility_off" : "visibility"' @click='showAiApiKey = !showAiApiKey' />
            </template>
          </q-input>
          <q-input
            v-if='isPortkeyProvider'
            v-model.trim='aiModelForm.virtual_key'
            dense
            outlined
            class='q-mb-sm'
            :type='showAiApiKey ? "text" : "password"'
            :label="$t('aiPortkeyVirtualKey')"
            :hint='aiVirtualKeyHint'
          />
          <q-toggle
            v-model='aiModelForm.clear_api_key'
            color='negative'
            :label='isPortkeyProvider ? $t("aiClearPortkeyApiKey") : $t("aiClearApiKey")'
            class='q-mb-sm'
          />
          <q-toggle
            v-if='isPortkeyProvider'
            v-model='aiModelForm.clear_virtual_key'
            color='negative'
            :label="$t('aiClearVirtualKey')"
            class='q-mb-sm'
          />
          <q-toggle
            v-model='aiModelForm.is_default'
            color='primary'
            :label="$t('aiSetDefault')"
          />
        </q-card-section>

        <q-card-actions align='right'>
          <q-btn flat :label="$t('cancel')" v-close-popup />
          <q-btn color='primary' unelevated :label="$t('save')" :loading='aiModelSaving' @click='submitAiModelForm' />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </q-dialog>
</template>

<script>
import { createNamespacedHelpers } from 'vuex'
import ImageUploadServiceDialog from './ImageUploadServiceDialog'
import UpdateDialog from 'components/ui/dialog/UpdateDialog'
import RuneCard from 'components/ui/dialog/RuneCard'
import RuneFormDialog from 'components/ui/dialog/RuneFormDialog'
import EchoFormDialog from 'components/ui/dialog/EchoFormDialog'
import { i18n } from 'boot/i18n'
import bus from 'components/bus'
import events from 'src/constants/events'
import { version } from '../../../../package.json'
import { checkUpdate, needUpdate, openLogFiles, openThemeFolder, refreshThemeFolder } from 'src/ApiInvoker'
import helper from 'src/utils/helper'
import DatabaseClient from 'src/utils/DatabaseClient'
import CloudSyncService from 'src/services/CloudSyncService'
import SessionStorageService from 'src/services/SessionStorageService'
import PortkeyService from 'src/services/PortkeyService'
import { NOTE_ORDER_TYPES } from 'src/constants/noteOrderTypes'

const SYNC_REASON_MESSAGES = {
  not_logged_in: 'offlineMode',
  already_syncing: 'cloudSyncSyncing'
}
import { Dark, Loading } from 'quasar'

const {
  mapState: mapClientState,
  mapActions: mapClientActions,
  mapMutations: mapClientMutations
} = createNamespacedHelpers('client')

export default {
  name: 'SettingsDialog',
  components: {
    ImageUploadServiceDialog,
    UpdateDialog,
    RuneCard,
    RuneFormDialog,
    EchoFormDialog
  },
  data () {
    return {
      tab: 'general',
      imageUploadServiceOptionsPlain: [
        'wizOfficialImageUploadService',
        'picgoServer',
        'none'
      ],
      version: version,
      checkingNotify: null,
      runeFormVisible: false,
      runeFormKey: 0,
      editingRune: null,
      echoFormVisible: false,
      echoFormKey: 0,
      editingEcho: null,
      pendingEchoTarget: null,
      dragFromIndex: null,
      dragEntityType: null,
      cloudSyncLoginState: {
        isLoggedIn: SessionStorageService.isLoggedIn(),
        accountInfo: SessionStorageService.getAccountInfo()
      },
      // 云同步状态
      syncStats: { total: 0, synced: 0, pending: 0 },
      lastSyncTimeDisplay: null,
      isSyncing: false,
      syncError: null,
      aiModelsLoading: false,
      aiModelSaving: false,
      aiModelDialogVisible: false,
      aiModelConfigs: [],
      showAiApiKey: false,
      aiProviderOptions: [
        { label: 'OpenAI-compatible', value: 'openai-compatible' },
        { label: 'Portkey', value: 'portkey' }
      ],
      aiModelForm: {
        id: null,
        name: '',
        provider_type: 'portkey',
        base_url: '',
        model: '',
        api_key: '',
        virtual_key: '',
        is_default: false,
        clear_api_key: false,
        clear_virtual_key: false
      }
    }
  },
  computed: {
    languageOptions: function () {
      return i18n.availableLocales.map(l => i18n.t(l))
    },
    themeOptions: function () {
      return this.themes.map(t => i18n.t(t.name))
    },
    imageUploadServiceOptions: function () {
      return [
        this.$t('wizOfficialImageUploadService'),
        this.$t('picgoServer'),
        this.$t('none')
      ]
    },
    noteOrderOptions: function () {
      return NOTE_ORDER_TYPES.map(value => ({
        label: this.$t(value),
        value
      }))
    },
    // ✅ 已移除 autoSaveGapLabel！不再需要
    // autoSaveGapLabel: function () { ... },
    
    localRuneCards: {
      get () {
        return this.runeCards
      },
      set (val) {
        this.updateStateAndStore({ runeCards: val })
      }
    },
    localEchoCards: {
      get () {
        return this.echoCards
      },
      set (val) {
        this.updateStateAndStore({ echoCards: val })
      }
    },
    lastSyncTimeFormatted () {
      if (!this.syncStatus?.lastSyncTime) return this.$t('never')
      return helper.displayDateElegantly(this.syncStatus.lastSyncTime)
    },
    syncStatusText () {
      const s = this.syncStatus
      if (s?.isSyncing) return this.$t('syncing')
      if (!s) return this.$t('never')
      return `${s.synced || 0}/${s.total || 0}`
    },
    isLoggedIn () {
      return this.cloudSyncLoginState.isLoggedIn
    },
    accountInfo () {
      return this.cloudSyncLoginState.accountInfo || {}
    },
    defaultAiModel () {
      return this.aiModelConfigs.find(item => item.is_default) || null
    },
    defaultAiModelUsable () {
      return PortkeyService.isConfigUsable(this.defaultAiModel)
    },
    defaultAiModelMissingFields () {
      return PortkeyService.getMissingFields(this.defaultAiModel)
    },
    defaultAiModelMissingFieldLabels () {
      return this.defaultAiModelMissingFields.map(field => this.$t(`aiField_${field}`))
    },
    defaultAiModelStatusColor () {
      return this.defaultAiModelUsable ? 'positive' : 'warning'
    },
    defaultAiModelStatusLabel () {
      return this.defaultAiModelUsable ? this.$t('aiDefaultModelStatusReady') : this.$t('aiDefaultModelStatusIncomplete')
    },
    defaultAiModelStatusHint () {
      if (!this.defaultAiModel) {
        return ''
      }

      if (this.defaultAiModelUsable) {
        return this.$t('aiDefaultModelStatusReadyHint')
      }

      return this.$t('aiDefaultModelStatusIncompleteHint', {
        fields: this.defaultAiModelMissingFieldLabels.join('、')
      })
    },
    aiModelApiKeyHint () {
      if (!this.aiModelForm.id) {
        return ''
      }

      if (this.aiModelForm.clear_api_key) {
        return this.$t('aiApiKeyWillBeCleared')
      }

      return this.aiModelForm.apiKeyMasked
        ? this.$t('aiApiKeySavedMasked', { masked: this.aiModelForm.apiKeyMasked })
        : this.$t('aiApiKeyOptionalOnEdit')
    },
    aiVirtualKeyHint () {
      if (!this.aiModelForm.id) {
        return ''
      }

      if (this.aiModelForm.clear_virtual_key) {
        return this.$t('aiVirtualKeyWillBeCleared')
      }

      return this.aiModelForm.virtualKeyMasked
        ? this.$t('aiVirtualKeySavedMasked', { masked: this.aiModelForm.virtualKeyMasked })
        : this.$t('aiVirtualKeyOptionalOnEdit')
    },
    isPortkeyProvider () {
      return this.aiModelForm.provider_type === 'portkey'
    },
    ...mapClientState([
      'language',
      'darkMode',
      'noteListDenseMode',
      'markdownOnly',
      'imageUploadService',
      'noteOrderType',
      'quickInsertColumns',
      'theme',
      'themes',
      'runeCards',
      'echoCards',
      'syncStatus'
    ])
  },
  methods: {
    toggle: function () {
      this.refreshCloudSyncLoginState()
      this.refreshCloudSyncStatus()
      return this.$refs.dialog.toggle()
    },
    show: function (options = {}) {
      this.refreshCloudSyncLoginState()
      this.refreshCloudSyncStatus()
      if (options && typeof options === 'object') {
        this.applyOpenOptions(options)
      }
      return this.$refs.dialog.show()
    },
    applyOpenOptions: function (options = {}) {
      const { tab = '', echoId = '', echoName = '', openEchoEdit = false } = options
      if (tab) {
        this.tab = tab
      }
      if (tab === 'echo' || openEchoEdit) {
        const matchedEcho = (this.localEchoCards || []).find(item => {
          if (!item) return false
          if (echoId && item.id === echoId) return true
          if (echoName && item.name === echoName) return true
          return false
        }) || null
        this.pendingEchoTarget = matchedEcho
        if (openEchoEdit && matchedEcho) {
          this.editingEcho = { ...matchedEcho }
          this.openEchoFormDialog()
        }
      }
    },
    languageChangeHandler: function (lan) {
      lan = i18n.availableLocales.find(l => {
        return i18n.t(l) === lan
      })
      this.updateStateAndStore({ language: lan })
      i18n.locale = lan
      this.$q.notify({
        message: this.$t('switchLanguageHint'),
        color: 'primary',
        icon: 'info'
      })
    },
    themeChangeHandler: function (theme) {
      theme = this.themes.find(t => {
        return i18n.t(t.name) === theme
      })
      this.updateStateAndStore({ theme: theme.name })
      this.$q.dark.set(theme.dark)
      this.toggleChanged({ key: 'darkMode', value: theme.dark })
    },
    imageUploadServiceChangeHandler: function (service) {
      const servicePlain = this.imageUploadServiceOptionsPlain.find(
        i => this.$t(i) === service
      )
      this.updateStateAndStore({ imageUploadService: servicePlain })
    },
    noteOrderChangeHandler: function (type) {
      if (!NOTE_ORDER_TYPES.includes(type)) return
      this.updateStateAndStore({ noteOrderType: type })
    },
    // ✅ 已移除 autoSaveGapChangeHandler！不再需要
    // autoSaveGapChangeHandler: function (value) { ... },
    
    checkUpdateHandler: function () {
      checkUpdate().then(() => {
        this.checkingNotify = this.$q.notify({
          message: this.$t('checking'),
          timeout: 0,
          spinner: true,
          color: 'primary',
          actions: [{
            icon: 'clear',
            color: 'white',
            handler: () => {}
          }]
        })
      })
    },
    openThemeFolderHandler: function () {
      openThemeFolder()
    },
    refreshThemeFolderHandler: async function () {
      const themes = await refreshThemeFolder()
      this.toggleChanged({ key: 'themes', value: themes })
    },
    themeHelpHandler: function () {
      this.$q.electron.shell.openExternal('https://www.tanknee.cn/Memocast/docs/tutorial-development/create-theme')
    },
    updateAvailableHandler: function (info) {
      console.log(info)
      if (this.checkingNotify && this.checkingNotify instanceof Function) {
        this.checkingNotify()
        this.checkingNotify = null
      }
      this.$q.notify({
        caption: this.$t('getNewerVersion', { version: info.version }),
        message: info.releaseNotes,
        html: true,
        color: 'positive',
        icon: 'system_update_alt',
        actions: [
          {
            label: this.$t('update'),
            color: 'white',
            handler: () => {
              if (this.$q.platform.is.mac) {
                window.open('https://github.com/TankNee/Memocast')
              } else {
                needUpdate(true)
                if (this.$refs.updateDialog) {
                  this.$refs.updateDialog.toggle()
                }
              }
            }
          }
        ]
      })
    },
    updateUnavailableHandler: function (info) {
      if (this.checkingNotify && this.checkingNotify instanceof Function) {
        this.checkingNotify()
        this.checkingNotify = null
      }
      // this.$q.notify({
      //   message: this.$t('noNewerVersion'),
      //   color: 'green',
      //   icon: 'check'
      // })
    },
    updateErrorHandler: function (err) {
      console.log(err)
      if (this.checkingNotify && this.checkingNotify instanceof Function) {
        this.checkingNotify()
        this.checkingNotify = null
      }
      if (err && !helper.isNullOrEmpty(err)) {
        this.$q.notify({
          caption: this.$t('updateError'),
          color: 'red-10',
          icon: 'error',
          message: err
        })
      }
    },
    openLogFilesHandler: function () {
      openLogFiles()
    },
    createEmptyAiModelForm () {
      return {
        id: null,
        name: '',
        provider_type: 'openai-compatible',
        base_url: '',
        model: '',
        api_key: '',
        virtual_key: '',
        is_default: false,
        clear_api_key: false,
        clear_virtual_key: false,
        apiKeyMasked: '',
        virtualKeyMasked: ''
      }
    },
    getAiProviderLabel (providerType) {
      return PortkeyService.getProviderLabel(providerType)
    },
    async loadAiModelConfigs () {
      this.aiModelsLoading = true
      try {
        this.aiModelConfigs = await DatabaseClient.aiModels.getAll()
      } finally {
        this.aiModelsLoading = false
      }
    },
    async openAiModelDialog (id = null, options = {}) {
      this.showAiApiKey = false
      this.aiModelForm = {
        ...this.createEmptyAiModelForm(),
        ...(options.markAsDefault ? { is_default: true } : {})
      }

      if (id) {
        const config = await DatabaseClient.aiModels.getById(id)
        if (!config) {
          this.$q.notify({
            message: this.$t('aiConfigLoadFailed'),
            type: 'negative',
            position: 'top'
          })
          return
        }

        this.aiModelForm = {
          id: config.id,
          name: config.name || '',
          provider_type: config.provider_type || 'openai-compatible',
          base_url: config.base_url || '',
          model: config.model || '',
          api_key: config.api_key || '',
          virtual_key: config.virtual_key || '',
          is_default: Boolean(config.is_default),
          clear_api_key: false,
          clear_virtual_key: false,
          apiKeyMasked: config.apiKeyMasked || '',
          virtualKeyMasked: config.portkeyVirtualKeyMasked || ''
        }
      }

      this.aiModelDialogVisible = true
    },
    validateAiModelForm () {
      const form = this.aiModelForm
      const normalizedName = String(form.name || '').trim()
      if (!normalizedName || !form.base_url || !form.model) {
        this.$q.notify({ message: this.$t('aiModelRequiredFields'), type: 'warning', position: 'top' })
        return false
      }

      const duplicateName = this.aiModelConfigs.find(item => {
        if (!item || !item.name) {
          return false
        }
        if (form.id && Number(item.id) === Number(form.id)) {
          return false
        }
        return String(item.name).trim().toLowerCase() === normalizedName.toLowerCase()
      })

      if (duplicateName) {
        this.$q.notify({ message: this.$t('aiConfigNameExists'), type: 'warning', position: 'top' })
        return false
      }

      try {
        const parsed = new URL(form.base_url)
        if (!/^https?:$/.test(parsed.protocol)) {
          throw new Error('invalid protocol')
        }
      } catch (error) {
        this.$q.notify({ message: this.$t('aiBaseUrlInvalid'), type: 'warning', position: 'top' })
        return false
      }

      if (!form.id && !form.api_key && !this.isPortkeyProvider) {
        this.$q.notify({ message: this.$t('aiApiKeyRequired'), type: 'warning', position: 'top' })
        return false
      }

      if (this.isPortkeyProvider) {
        if (!form.api_key && !form.id) {
          this.$q.notify({ message: this.$t('aiPortkeyApiKeyRequired'), type: 'warning', position: 'top' })
          return false
        }

        if (!form.virtual_key && !form.id) {
          this.$q.notify({ message: this.$t('aiVirtualKeyRequired'), type: 'warning', position: 'top' })
          return false
        }
      }

      return true
    },
    async submitAiModelForm () {
      if (!this.validateAiModelForm()) {
        return
      }

      this.aiModelSaving = true
      try {
        const payload = {
          id: this.aiModelForm.id,
          name: this.aiModelForm.name,
          provider_type: this.aiModelForm.provider_type,
          base_url: this.aiModelForm.base_url,
          model: this.aiModelForm.model,
          api_key: this.aiModelForm.clear_api_key ? '' : this.aiModelForm.api_key,
          virtual_key: this.aiModelForm.clear_virtual_key ? '' : this.aiModelForm.virtual_key,
          is_default: this.aiModelForm.is_default,
          clear_api_key: this.aiModelForm.clear_api_key,
          clear_virtual_key: this.aiModelForm.clear_virtual_key
        }
        const result = await DatabaseClient.aiModels.save(payload)
        if (!result || result.success === false) {
          const errorCode = result && result.code
          const messageKey = errorCode === 'AI_MODEL_DUPLICATE_NAME'
            ? 'aiConfigNameExists'
            : 'aiConfigSaveFailed'
          this.$q.notify({ message: this.$t(messageKey), type: errorCode === 'AI_MODEL_DUPLICATE_NAME' ? 'warning' : 'negative', position: 'top' })
          return
        }

        this.aiModelDialogVisible = false
        await this.loadAiModelConfigs()
        this.$q.notify({ message: this.$t('aiConfigSaved'), type: 'positive', position: 'top' })
      } catch (error) {
        const isDuplicateNameError = /UNIQUE constraint failed:\s*ai_model_configs\.name/i.test(String(error && error.message ? error.message : error))
        this.$q.notify({
          message: this.$t(isDuplicateNameError ? 'aiConfigNameExists' : 'aiConfigSaveFailed'),
          type: isDuplicateNameError ? 'warning' : 'negative',
          position: 'top'
        })
      } finally {
        this.aiModelSaving = false
      }
    },
    async setDefaultAiModel (item) {
      const success = await DatabaseClient.aiModels.setDefault(item.id)
      if (!success) {
        this.$q.notify({ message: this.$t('aiConfigSaveFailed'), type: 'negative', position: 'top' })
        return
      }

      await this.loadAiModelConfigs()
      this.$q.notify({ message: this.$t('aiDefaultModelUpdated'), type: 'positive', position: 'top' })
    },
    confirmDeleteAiModel (item) {
      this.$q.dialog({
        title: this.$t('aiModelDelete'),
        message: this.$t('aiModelDeleteConfirm', { name: item.name }),
        cancel: { label: this.$t('cancel') },
        ok: { label: this.$t('aiModelDelete'), color: 'negative' }
      }).onOk(async () => {
        const success = await DatabaseClient.aiModels.remove(item.id)
        if (!success) {
          this.$q.notify({ message: this.$t('aiConfigDeleteFailed'), type: 'negative', position: 'top' })
          return
        }

        await this.loadAiModelConfigs()
        this.$q.notify({ message: this.$t('aiConfigDeleted'), type: 'positive', position: 'top' })
      })
    },
    resetSqliteHandler: async function () {
      this.$q.dialog({
        title: this.$t('resetSqlite'),
        message: this.$t('resetSqliteConfirm'),
        cancel: { label: this.$t('cancel') },
        ok: { label: this.$t('confirm'), color: 'negative' }
      }).onOk(async () => {
        const success = await DatabaseClient.sync.resetDatabase()
        if (success) {
          // 重置同步状态
          this.UPDATE_SYNC_STATUS({
            isSyncing: false,
            lastSyncTime: null,
            total: 0,
            synced: 0,
            pending: 0
          })
          this.$q.notify({
            message: this.$t('resetSqliteSuccess'),
            type: 'positive',
            position: 'top'
          })
        } else {
          this.$q.notify({
            message: this.$t('resetSqliteFailed'),
            type: 'negative',
            position: 'top'
          })
        }
      })
    },
    onRuneSortEnd: function () {
      this.saveRunes(this.localRuneCards)
    },
    onDragStart: function (e, index, entityType = 'rune') {
      this.dragFromIndex = index
      this.dragEntityType = entityType
      e.dataTransfer.effectAllowed = 'move'
      e.dataTransfer.setData('text/plain', index)
      e.target.closest('.rune-card-wrapper').classList.add('rune-dragging')
    },
    onDragOver: function (e, index, entityType = 'rune') {
      e.preventDefault()
      e.dataTransfer.dropEffect = 'move'
      const wrapper = e.target.closest('.rune-card-wrapper')
      if (wrapper && this.dragEntityType === entityType && this.dragFromIndex !== index) {
        document.querySelectorAll('.rune-card-wrapper').forEach(el => el.classList.remove('rune-dragover'))
        wrapper.classList.add('rune-dragover')
      }
    },
    onDrop: function (e, toIndex, entityType = 'rune') {
      e.preventDefault()
      document.querySelectorAll('.rune-card-wrapper').forEach(el => el.classList.remove('rune-dragover'))
      if (this.dragEntityType !== entityType) return
      const fromIndex = this.dragFromIndex
      if (fromIndex === null || fromIndex === toIndex) return
      const cards = [...(entityType === 'echo' ? this.localEchoCards : this.localRuneCards)]
      const [moved] = cards.splice(fromIndex, 1)
      cards.splice(toIndex, 0, moved)
      if (entityType === 'echo') {
        this.updateStateAndStore({ echoCards: cards })
        this.saveEchoes(cards)
        this.$nextTick(() => {
          bus.$emit(events.RENDER_EVENTS.codeStyleUpdate)
        })
      } else {
        this.updateStateAndStore({ runeCards: cards })
        this.saveRunes(cards)
      }
    },
    onDragEnd: function (e, entityType = 'rune') {
      const wrapper = e.target.closest('.rune-card-wrapper')
      if (wrapper) {
        wrapper.classList.remove('rune-dragging')
      }
      document.querySelectorAll('.rune-card-wrapper').forEach(el => el.classList.remove('rune-dragover'))
      this.dragFromIndex = null
      this.dragEntityType = null
    },
    openEditRune: function (rune) {
      this.editingRune = { ...rune }
      this.openRuneFormDialog()
    },
    openAddRune: function () {
      this.editingRune = null
      this.openRuneFormDialog()
    },
    openRuneFormDialog: function () {
      this.runeFormKey += 1
      this.runeFormVisible = true
    },
    onRuneFormVisibleChange: function (visible) {
      this.runeFormVisible = visible
      if (!visible) {
        this.$nextTick(() => {
          this.editingRune = null
        })
      }
    },
    destroyRuneFormDialog: function () {
      this.runeFormVisible = false
      this.$nextTick(() => {
        this.editingRune = null
      })
    },
    openEditEcho: function (echo) {
      this.editingEcho = { ...echo }
      this.openEchoFormDialog()
    },
    openAddEcho: function () {
      this.editingEcho = null
      this.openEchoFormDialog()
    },
    openEchoFormDialog: function () {
      this.echoFormKey += 1
      this.echoFormVisible = true
    },
    onEchoFormVisibleChange: function (visible) {
      this.echoFormVisible = visible
      if (!visible) {
        this.$nextTick(() => {
          this.editingEcho = null
        })
      }
    },
    destroyEchoFormDialog: function () {
      this.echoFormVisible = false
      this.$nextTick(() => {
        this.editingEcho = null
      })
    },
    confirmDeleteRune: async function (rune) {
      this.$q.dialog({
        title: this.$t('runeCardDelete'),
        message: this.$t('runeCardDeleteConfirm'),
        cancel: { label: this.$t('cancel') },
        persistent: true
      }).onOk(async () => {
        await this.deleteRune(rune.id)
        const filtered = this.localRuneCards.filter(r => r.id !== rune.id)
        this.updateStateAndStore({ runeCards: filtered })
      })
    },
    confirmDeleteEcho: async function (echo) {
      this.$q.dialog({
        title: this.$t('echoCardDelete'),
        message: this.$t('echoCardDeleteConfirm'),
        cancel: { label: this.$t('cancel') },
        persistent: true
      }).onOk(async () => {
        await this.deleteEcho(echo.id)
        const filtered = this.localEchoCards.filter(item => item.id !== echo.id)
        this.updateStateAndStore({ echoCards: filtered })
        this.$nextTick(() => {
          bus.$emit(events.RENDER_EVENTS.codeStyleUpdate)
        })
      })
    },
    onRuneSubmit: async function (data) {
      const saved = await this.saveRune(data)
      if (saved) {
        const cards = [...this.localRuneCards]
        const idx = cards.findIndex(r => r.id === data.id)
        if (idx >= 0) {
          cards.splice(idx, 1, saved)
        } else {
          cards.push(saved)
        }
        this.updateStateAndStore({ runeCards: cards })
        this.$nextTick(() => {
          bus.$emit(events.RENDER_EVENTS.codeStyleUpdate)
        })
      }
      this.destroyRuneFormDialog()
    },
    onEchoSubmit: async function (data) {
      const payload = {
        ...data,
        anno_source: data.anno_source || data.template || '',
        render_type: data.render_type || 'anno'
      }
      const saved = await this.saveEcho(payload)
      if (saved) {
        const cards = [...this.localEchoCards]
        const idx = cards.findIndex(item => item.id === data.id)
        if (idx >= 0) {
          cards.splice(idx, 1, saved)
        } else {
          cards.push(saved)
        }
        this.updateStateAndStore({ echoCards: cards })
        this.$nextTick(() => {
          bus.$emit(events.RENDER_EVENTS.codeStyleUpdate)
        })
      }
      this.destroyEchoFormDialog()
    },

    // ==================== 云同步 ====================
    refreshCloudSyncLoginState () {
      this.cloudSyncLoginState = {
        isLoggedIn: SessionStorageService.isLoggedIn(),
        accountInfo: SessionStorageService.getAccountInfo()
      }
    },

    formatSyncFailureMessage (result) {
      if (!result) {
        return this.$t('cloudSyncFailed')
      }

      if (result.error) {
        return result.error
      }

      const messageKey = SYNC_REASON_MESSAGES[result.reason]
      if (messageKey) {
        return this.$t(messageKey)
      }

      return this.$t('cloudSyncFailed')
    },

    async refreshCloudSyncStatus () {
      this.refreshCloudSyncLoginState()
      const stats = await DatabaseClient.sync.getStats()
      this.syncStats = {
        total: stats.total || 0,
        synced: stats.synced || 0,
        pending: stats.pending || 0
      }
      const lastTime = CloudSyncService.formatLastSyncTime()
      this.lastSyncTimeDisplay = lastTime
    },

    async doSync () {
      this.syncError = null
      this.isSyncing = true
      const result = await CloudSyncService.sync()
      this.isSyncing = false
      await this.refreshCloudSyncStatus()
      if (result.success) {
        this.$q.notify({ message: this.$t('cloudBackupComplete'), type: 'positive', icon: 'cloud_upload' })
      } else {
        this.syncError = this.formatSyncFailureMessage(result)
      }
    },

    async doPullOnly () {
      this.syncError = null
      Loading.show({
        message: this.$t('cloudRestorePreviewLoading')
      })

      let preview = { success: false, stats: { total: 0, pulled: 0, skipped: 0, backfilled: 0 } }
      try {
        preview = await CloudSyncService.getRestorePreview()
      } finally {
        Loading.hide()
      }

      const stats = preview.stats || { total: 0, pulled: 0, skipped: 0, backfilled: 0 }
      const message = `${this.$t('cloudRestoreConfirmMessage')}<br><br><strong>${this.$t('cloudRestorePreviewTitle')}</strong><br>${this.$t('cloudRestorePreviewTotal')}: ${stats.total || 0}<br>${this.$t('cloudRestorePreviewNew')}: ${stats.pulled || 0}<br>${this.$t('cloudRestorePreviewSkipped')}: ${stats.skipped || 0}<br>${this.$t('cloudRestorePreviewBackfilled')}: ${stats.backfilled || 0}`

      this.$q.dialog({
        title: this.$t('cloudRestoreConfirmTitle'),
        message,
        html: true,
        cancel: { label: this.$t('cancel') },
        ok: { label: this.$t('cloudSyncSyncPullOnly'), color: 'primary' }
      }).onOk(async () => {
        this.syncError = null
        this.isSyncing = true
        const result = await CloudSyncService.pullOnly()
        this.isSyncing = false
        await this.refreshCloudSyncStatus()
        if (result.success) {
          this.$q.notify({ message: `${this.$t('cloudRestoreComplete')} ↓${result.pulled || 0}`, type: 'positive', icon: 'cloud_download' })
        } else {
          this.syncError = this.formatSyncFailureMessage(result)
        }
      })
    },

    async doPushOnly () {
      this.syncError = null
      this.isSyncing = true
      const result = await CloudSyncService.pushOnly()
      this.isSyncing = false
      await this.refreshCloudSyncStatus()
      if (result.success) {
        this.$q.notify({ message: `${this.$t('cloudBackupComplete')} ↑${result.count || 0}`, type: 'positive', icon: 'cloud_upload' })
      } else {
        this.syncError = this.formatSyncFailureMessage(result)
      }
    },

    openLoginDialog () {
      this.$refs.dialog.hide()
      this.$nextTick(() => {
        bus.$emit('showLoginDialog')
      })
    },

    confirmLogout () {
      this.$q.dialog({
        title: this.$t('cloudSyncLogout'),
        message: this.$t('cloudSyncLogoutConfirm'),
        cancel: { label: this.$t('cancel') },
        ok: { label: this.$t('cloudSyncLogout'), color: 'negative' }
      }).onOk(async () => {
        await this.$store.dispatch('server/logout')
        await this.refreshCloudSyncStatus()
        this.$q.notify({ message: this.$t('cloudSyncOfflineMode'), type: 'info', icon: 'cloud_off' })
      })
    },

    onCloudSyncStatusChange (event) {
      if (event.type === 'sync_start') {
        this.isSyncing = true
      } else if (event.type === 'sync_complete') {
        this.isSyncing = false
        this.refreshCloudSyncStatus()
      } else if (event.type === 'sync_error') {
        this.isSyncing = false
        this.syncError = event.error
      }
    },
    ...mapClientActions([
      'toggleChanged',
      'updateStateAndStore',
      'loadRunes',
      'loadEchoes',
      'saveRune',
      'saveEcho',
      'deleteRune',
      'deleteEcho',
      'saveRunes',
      'saveEchoes',
      'sync',
      'refreshSyncStatus'
    ]),
    ...mapClientMutations({ UPDATE_SYNC_STATUS: 'update_sync_status' })
  },
  mounted () {
    bus.$on(events.UPDATE_EVENTS.updateAvailable, this.updateAvailableHandler)
    bus.$on(events.UPDATE_EVENTS.updateNotAvailable, this.updateUnavailableHandler)
    bus.$on(events.UPDATE_EVENTS.updateError, this.updateErrorHandler)
    this.loadRunes()
    this.loadEchoes()
    this.loadAiModelConfigs()
    // 初始化云同步状态
    CloudSyncService.addListener(this.onCloudSyncStatusChange)
    this.refreshCloudSyncStatus()
  },
  beforeDestroy () {
    bus.$off(events.UPDATE_EVENTS.updateAvailable)
    bus.$off(events.UPDATE_EVENTS.updateNotAvailable)
    bus.$off(events.UPDATE_EVENTS.updateError)
    CloudSyncService.removeListener(this.onCloudSyncStatusChange)
  }
}
</script>

<style scoped>
.settings-dialog-card {
  height: 70vh;
  min-width: 70vw;
  user-select: none;
}

.settings-dialog-toolbar {
  min-height: 40px;
  padding: 4px 8px;
}

.settings-dialog-body {
  padding-top: 4px;
  padding-bottom: 8px;
}

.settings-dialog-layout {
  display: flex;
  flex-direction: row;
  align-items: stretch;
  min-height: 0;
  height: calc(70vh - 52px);
}

.settings-dialog-nav {
  flex: 0 0 auto;
  width: 4.75rem;
  min-width: 4.75rem;
  max-width: 4.75rem;
  padding: 2px 0 4px;
}

.settings-dialog-sep {
  flex-shrink: 0;
}

.settings-dialog-panels {
  flex: 1 1 auto;
  min-width: 0;
  overflow: auto;
  scrollbar-width: thin;
  scrollbar-color: rgba(120, 120, 120, 0.45) transparent;
}

.settings-dialog-panels::-webkit-scrollbar,
.settings-dialog-body::-webkit-scrollbar {
  width: 8px;
}

.settings-dialog-panels::-webkit-scrollbar-thumb,
.settings-dialog-body::-webkit-scrollbar-thumb {
  background: rgba(120, 120, 120, 0.45);
  border-radius: 999px;
}

.settings-dialog-panels::-webkit-scrollbar-track,
.settings-dialog-body::-webkit-scrollbar-track {
  background: transparent;
}

.settings-dialog-tabs {
  width: 100%;
}

.settings-dialog-tabs ::v-deep(.q-tabs__content) {
  padding: 0;
}

.settings-dialog-tabs ::v-deep(.q-tab) {
  min-height: 32px;
  padding: 2px 4px;
}

.settings-dialog-tabs ::v-deep(.q-tab__icon) {
  font-size: 1.15rem;
}

.settings-dialog-tabs ::v-deep(.q-tab__label) {
  font-size: 0.7rem;
  line-height: 1.1;
  margin-top: 1px;
}

.panel-title {
  padding-left: 2px;
}

.panel-title-bar {
  width: 3px;
  min-height: 1rem;
  margin-right: 8px;
  border-radius: 1px;
  flex-shrink: 0;
}

.setting-item {
  margin-top: 0.45rem;
}

.setting-item--row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.setting-item--row .q-toggle {
  flex-shrink: 0;
}

.rune-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 12px;
  padding: 4px;
  min-height: 80px;
  align-items: stretch;
}

.rune-card-wrapper {
  display: flex;
  min-width: 0;
}

.rune-card-item {
  width: 100%;
}

.rune-card-wrapper.rune-dragging {
  opacity: 0.4;
  transform: scale(0.95);
}

.rune-card-wrapper.rune-dragover .rune-card {
  box-shadow: 0 0 0 3px #7E57C2;
  transform: translateY(-2px);
}

.rune-ghost {
  opacity: 0.4;
  transform: scale(0.95);
}

.rune-chosen {
  box-shadow: 0 4px 20px rgba(156, 39, 176, 0.4);
}

.cloud-sync-summary {
  padding: 12px;
  border: 1px solid rgba(76, 175, 80, 0.16);
  border-radius: 10px;
  background: rgba(76, 175, 80, 0.04);
}

.cloud-sync-summary__header {
  min-width: 0;
}

/* 云同步面板 */
.server-section {
  margin-top: 12px;
  padding-top: 8px;
}

.server-section-separator {
  margin-top: 8px;
  margin-bottom: 14px;
}

.sync-stat-card {
  background: #f5f5f5;
  border-radius: 6px;
  padding: 8px 12px;
  text-align: center;
}

.ai-model-default-card,
.ai-model-card {
  border-radius: 8px;
}

.ai-model-form-card {
  width: 520px;
  max-width: 92vw;
}

.ai-model-empty {
  border: 1px dashed rgba(127, 127, 127, 0.35);
  border-radius: 8px;
}

.body--dark .sync-stat-card {
  background: #2a2a2a;
}
</style>
