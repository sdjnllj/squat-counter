class MotionDataCollector {
    constructor() {
        this.isRecording = false;
        this.startTime = null;
        this.data = [];
        this.sampleInterval = 20; // 采样间隔（毫秒）
        this.sampleTimer = null;
        
        // DOM 元素
        this.startBtn = document.getElementById('startBtn');
        this.stopBtn = document.getElementById('stopBtn');
        this.downloadBtn = document.getElementById('downloadBtn');
        this.statusDisplay = document.getElementById('status');
        this.timerDisplay = document.getElementById('timer');
        this.dataStatus = document.getElementById('dataStatus');

        // 绑定事件处理器
        this.startBtn.addEventListener('click', () => this.startRecording());
        this.stopBtn.addEventListener('click', () => this.stopRecording());
        this.downloadBtn.addEventListener('click', () => this.downloadData());

        // 检查传感器支持
        if (window.DeviceMotionEvent && window.DeviceOrientationEvent) {
            this.initializeSensors();
        } else {
            this.statusDisplay.textContent = '您的设备不支持必要的传感器';
            this.startBtn.disabled = true;
        }
    }

    async initializeSensors() {
        try {
            // 请求传感器权限
            if (typeof DeviceMotionEvent.requestPermission === 'function') {
                const motionPermission = await DeviceMotionEvent.requestPermission();
                if (motionPermission !== 'granted') {
                    throw new Error('需要运动传感器权限');
                }
            }
            
            if (typeof DeviceOrientationEvent.requestPermission === 'function') {
                const orientationPermission = await DeviceOrientationEvent.requestPermission();
                if (orientationPermission !== 'granted') {
                    throw new Error('需要方向传感器权限');
                }
            }

            // 添加传感器事件监听器
            window.addEventListener('devicemotion', (event) => this.handleMotion(event));
            window.addEventListener('deviceorientation', (event) => this.handleOrientation(event));
            
            this.statusDisplay.textContent = '准备就绪';
            this.startBtn.disabled = false;
        } catch (error) {
            console.error('Error initializing sensors:', error);
            this.statusDisplay.textContent = '初始化传感器失败: ' + error.message;
            this.startBtn.disabled = true;
        }
    }

    startRecording() {
        // 开始3秒倒计时
        this.statusDisplay.textContent = '3秒后开始记录...';
        this.startBtn.disabled = true;
        
        let countdown = 3;
        const countdownInterval = setInterval(() => {
            countdown--;
            if (countdown > 0) {
                this.statusDisplay.textContent = `${countdown}秒后开始记录...`;
            } else {
                clearInterval(countdownInterval);
                this.beginDataCollection();
            }
        }, 1000);
    }

    beginDataCollection() {
        this.isRecording = true;
        this.startTime = Date.now();
        this.data = [];
        this.lastMotionEvent = null;
        this.lastOrientationEvent = null;
        
        this.statusDisplay.textContent = '正在记录...';
        this.stopBtn.disabled = false;
        this.downloadBtn.disabled = true;
        
        // 开始定时采样
        this.sampleTimer = setInterval(() => this.recordSample(), this.sampleInterval);
        
        // 开始计时器显示
        this.updateTimer();
    }

    updateTimer() {
        if (!this.isRecording) return;
        
        const elapsed = Date.now() - this.startTime;
        const seconds = Math.floor(elapsed / 1000);
        const minutes = Math.floor(seconds / 60);
        
        this.timerDisplay.textContent = `${String(minutes).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
        
        requestAnimationFrame(() => this.updateTimer());
    }

    handleMotion(event) {
        this.lastMotionEvent = event;
    }

    handleOrientation(event) {
        this.lastOrientationEvent = event;
    }

    recordSample() {
        if (!this.isRecording) return;

        const motion = this.lastMotionEvent?.accelerationIncludingGravity;
        const orientation = this.lastOrientationEvent;
        
        const sample = {
            timestamp: Date.now() - this.startTime,
            acceleration: motion ? {
                x: motion.x,
                y: motion.y,
                z: motion.z
            } : null,
            orientation: orientation ? {
                alpha: orientation.alpha, // 指南针方向
                beta: orientation.beta,   // 前后倾斜
                gamma: orientation.gamma  // 左右倾斜
            } : null
        };

        this.data.push(sample);
        this.updateDataStatus();
    }

    updateDataStatus() {
        const seconds = ((Date.now() - this.startTime) / 1000).toFixed(1);
        this.dataStatus.textContent = `已记录 ${this.data.length} 个数据点 (${seconds}秒)`;
    }

    stopRecording() {
        this.isRecording = false;
        clearInterval(this.sampleTimer);
        
        this.statusDisplay.textContent = '记录完成！';
        this.stopBtn.disabled = true;
        this.downloadBtn.disabled = false;
        this.startBtn.disabled = false;
    }

    downloadData() {
        const dataBlob = new Blob([JSON.stringify(this.data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(dataBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `squat-motion-data-${new Date().toISOString()}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }
}

// 等待 DOM 加载完成后初始化
document.addEventListener('DOMContentLoaded', () => {
    window.motionCollector = new MotionDataCollector();
});
