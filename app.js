class SquatCounter {
    constructor() {
        this.counter = 0;
        this.isTracking = false;
        this.lastY = 0;
        this.threshold = 5; // 默认灵敏度
        this.cooldown = false;
        this.cooldownTime = 1000; // 防重复计数的冷却时间（毫秒）
        this.motionBuffer = []; // 用于存储最近的运动数据
        this.bufferSize = 3; // 缓冲区大小
        
        // 初始化音频上下文
        this.audioContext = null;
        this.initAudioContext();

        // DOM 元素
        this.counterDisplay = document.getElementById('counter');
        this.startBtn = document.getElementById('startBtn');
        this.resetBtn = document.getElementById('resetBtn');
        this.statusDisplay = document.getElementById('status');
        this.sensitivitySlider = document.getElementById('sensitivity');
        this.sensitivityValue = document.getElementById('sensitivityValue');

        // 绑定事件处理器
        this.startBtn.addEventListener('click', () => this.toggleTracking());
        this.resetBtn.addEventListener('click', () => this.reset());
        this.sensitivitySlider.addEventListener('input', (e) => {
            console.log('Sensitivity changed:', e.target.value);
            this.updateSensitivity();
        });

        // 初始化灵敏度显示
        this.updateSensitivity();

        // 检查设备运动传感器支持
        if (window.DeviceMotionEvent) {
            window.addEventListener('devicemotion', (event) => this.handleMotion(event));
        } else {
            this.statusDisplay.textContent = '您的设备不支持运动传感器';
            this.startBtn.disabled = true;
        }

        // 请求传感器权限（某些浏览器需要）
        if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
            this.startBtn.addEventListener('click', async () => {
                try {
                    const permission = await DeviceMotionEvent.requestPermission();
                    if (permission === 'granted') {
                        this.toggleTracking();
                    } else {
                        this.statusDisplay.textContent = '需要传感器权限才能使用';
                    }
                } catch (error) {
                    console.error('Error requesting motion permission:', error);
                    this.statusDisplay.textContent = '获取权限失败';
                }
            });
        }
    }

    initAudioContext() {
        // 在用户交互时初始化音频上下文
        const initAudio = () => {
            if (!this.audioContext) {
                this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            }
            document.removeEventListener('click', initAudio);
        };
        document.addEventListener('click', initAudio);
    }

    playCountSound() {
        if (!this.audioContext) return;

        // 创建音调
        const oscillator = this.audioContext.createOscillator();
        const gainNode = this.audioContext.createGain();
        
        // 设置音调参数
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(880, this.audioContext.currentTime); // A5音
        
        // 设置音量包络
        gainNode.gain.setValueAtTime(0, this.audioContext.currentTime);
        gainNode.gain.linearRampToValueAtTime(0.3, this.audioContext.currentTime + 0.01);
        gainNode.gain.linearRampToValueAtTime(0, this.audioContext.currentTime + 0.15);
        
        // 连接节点
        oscillator.connect(gainNode);
        gainNode.connect(this.audioContext.destination);
        
        // 播放声音
        oscillator.start();
        oscillator.stop(this.audioContext.currentTime + 0.15);
    }

    updateSensitivity() {
        const value = parseFloat(this.sensitivitySlider.value);
        // 使用非线性映射来调整灵敏度
        // 当滑块值较小时，阈值变化较大；当滑块值较大时，阈值变化较小
        this.threshold = 8 - Math.pow(value / 10, 1.5) * 7;
        console.log('New threshold:', this.threshold);
        this.sensitivityValue.textContent = value.toFixed(1);
        
        // 更新状态显示
        if (this.isTracking) {
            this.statusDisplay.textContent = `正在计数...（灵敏度：${value.toFixed(1)}）`;
        }
    }

    handleMotion(event) {
        if (!this.isTracking || this.cooldown) return;

        const acceleration = event.accelerationIncludingGravity;
        if (!acceleration) return;

        const currentY = acceleration.y;
        
        // 将当前运动数据添加到缓冲区
        this.motionBuffer.push(Math.abs(currentY - this.lastY));
        if (this.motionBuffer.length > this.bufferSize) {
            this.motionBuffer.shift(); // 移除最旧的数据
        }

        // 计算平均运动幅度
        const averageMotion = this.motionBuffer.reduce((a, b) => a + b, 0) / this.motionBuffer.length;
        
        // 检测向上运动（完成一次蹲起）
        if (averageMotion > this.threshold) {
            this.incrementCounter();
            this.setCooldown();
            console.log('Motion detected:', averageMotion, 'Threshold:', this.threshold);
        }

        this.lastY = currentY;
    }

    incrementCounter() {
        this.counter++;
        this.counterDisplay.textContent = this.counter;
        // 播放声音反馈
        this.playCountSound();
        // 添加视觉反馈
        this.counterDisplay.style.transform = 'scale(1.2)';
        setTimeout(() => {
            this.counterDisplay.style.transform = 'scale(1)';
        }, 200);
    }

    setCooldown() {
        this.cooldown = true;
        setTimeout(() => {
            this.cooldown = false;
        }, this.cooldownTime);
    }

    toggleTracking() {
        this.isTracking = !this.isTracking;
        this.startBtn.textContent = this.isTracking ? '暂停' : '开始';
        const sensitivity = parseFloat(this.sensitivitySlider.value).toFixed(1);
        this.statusDisplay.textContent = this.isTracking ? 
            `正在计数...（灵敏度：${sensitivity}）` : '已暂停';
        
        if (this.isTracking) {
            this.startBtn.style.backgroundColor = '#dc3545';
            // 重置运动缓冲区
            this.motionBuffer = [];
        } else {
            this.startBtn.style.backgroundColor = '#1a73e8';
        }
    }

    reset() {
        this.counter = 0;
        this.counterDisplay.textContent = '0';
        this.isTracking = false;
        this.startBtn.textContent = '开始';
        this.startBtn.style.backgroundColor = '#1a73e8';
        this.statusDisplay.textContent = '准备就绪';
        this.motionBuffer = [];
    }
}

// 等待 DOM 加载完成后再初始化应用
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM loaded, initializing app...');
    window.squatCounter = new SquatCounter();
});
