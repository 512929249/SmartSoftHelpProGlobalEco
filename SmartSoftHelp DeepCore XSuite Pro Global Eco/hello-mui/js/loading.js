// SmoothLoader.js v5.0 (生产环境优化版)
; (function (global) {
    'use strict';

    /**
     * 增强版配置系统（支持运行时动态更新）
     * @typedef {Object} LoaderConfig
     * @property {number} [minDuration=1500] - 最小显示时长（防闪烁）
     * @property {number} [delayThreshold=300] - 延迟显示阈值
     * @property {'spin'|'bar'|'custom'} [animationType='spin'] - 动画类型
     * @property {number} [zIndex=2147483647] - 层叠上下文
     * @property {string} [bgColor='rgba(255,255,255,0.97)'] - 遮罩背景
     * @property {string} [primaryColor='#2196F3'] - 主色调
     * @property {number} [spinnerSize=40] - 动画尺寸
     * @property {string} [containerClass=''] - 容器扩展类
     * @property {string} [spinnerClass=''] - spinner扩展类
     * @property {boolean} [autoInit=true] - 自动初始化
     * @property {boolean} [observeMutations=true] - DOM变化观测
     */
    const defaultConfig = Object.freeze({
        minDuration: 1500,
        delayThreshold: 300,
        animationType: 'spin',
        zIndex: 2147483647,
        bgColor: 'rgba(255,255,255,0.97)',
        primaryColor: '#2196F3',
        spinnerSize: 40,
        containerClass: '',
        spinnerClass: '',
        autoInit: true,
        observeMutations: true
    });

    // 单例检测与状态隔离
    if (global.__SmoothLoader) return;
    let currentConfig = { ...defaultConfig };

    // 核心样式生成器（支持主题扩展）
    const generateStyles = config => `
        :root {
            --smooth-loader-bg: ${config.bgColor};
            --smooth-loader-color: ${config.primaryColor};
            --smooth-loader-size: ${config.spinnerSize}px;
        }

        .s-loader-container {
            position: fixed;
            inset: 0;
            display: none;
            justify-content: center;
            align-items: center;
            background: var(--smooth-loader-bg);
            z-index: ${config.zIndex};
            opacity: 0;
            transition: opacity 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            pointer-events: none;
        }

        .s-loader-container.active {
            opacity: 1;
        }

        .s-spinner {
            width: var(--smooth-loader-size);
            height: var(--smooth-loader-size);
            border: 3px solid var(--smooth-loader-color);
            border-top-color: transparent;
            border-radius: 50%;
            animation: smooth-spin 0.8s linear infinite;
        }

        @keyframes smooth-spin {
            to { transform: rotate(360deg); }
        }

        [data-smooth-loading] {
            position: relative;
            overflow: hidden;
        }

        [data-smooth-loading]::after {
            content: '';
            position: absolute;
            inset: 0;
            background: inherit;
            opacity: 0.9;
        }
    `;

    // 状态管理增强（支持多实例）
    class LoaderState {
        constructor() {
            this.requestCount = 0;
            this.timeoutId = null;
            this.startTime = 0;
            this.isMounted = false;
            this.observer = null;
        }

        initDOM() {
            if (this.isMounted) return;

            const container = document.createElement('div');
            container.className = `s-loader-container ${currentConfig.containerClass}`.trim();
            container.setAttribute('aria-live', 'polite');
            container.setAttribute('aria-label', 'Loading...');

            const spinner = document.createElement('div');
            spinner.className = `s-spinner ${currentConfig.spinnerClass}`.trim();
            spinner.innerHTML = '<span class="sr-only">Loading...</span>';

            const style = document.createElement('style');
            style.textContent = generateStyles(currentConfig);

            document.head.append(style);
            container.append(spinner);
            document.body.append(container);
            this.isMounted = true;
        }

        // 状态更新方法
        updateCounter(delta) {
            this.requestCount = Math.max(this.requestCount + delta, 0);
            return this.requestCount;
        }
    }

    // 网络请求拦截器（支持AbortController）
    const createInterceptor = state => {
        const original = {
            XHR: global.XMLHttpRequest,
            fetch: global.fetch
        };

        class InterceptedXHR extends original.XHR {
            constructor() {
                super();
                this._isCompleted = false;
                this.addEventListener('loadend', this.handleComplete);
                this.addEventListener('abort', this.handleComplete);
            }

            send(...args) {
                if (!this._isCompleted) {
                    state.updateCounter(1);
                    this.dispatchLoading();
                }
                try {
                    return super.send(...args);
                } catch (error) {
                    this.handleComplete();
                    throw error;
                }
            }

            handleComplete = () => {
                if (this._isCompleted) return;
                this._isCompleted = true;
                if (state.updateCounter(-1) === 0) {
                    this.dispatchComplete();
                }
            }

            dispatchLoading = () => {
                global.dispatchEvent(new CustomEvent('smoothloader:loading'));
            }

            dispatchComplete = () => {
                global.dispatchEvent(new CustomEvent('smoothloader:complete'));
            }
        }

        const wrappedFetch = (...args) => {
            state.updateCounter(1);
            const controller = new AbortController();
            co