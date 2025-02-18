class SquatCounter {
    constructor() {
        this.counter = 0;
        this.isTracking = false;
        this.lastY = 0;
        this.threshold = 3; // 默认灵敏度
        this.cooldown = false;
        this.cooldownTime = 1000; // 防重复计数的冷却时间（毫秒）

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
            console.log('Sensitivity changed:', e.target.value); // 添加调试日志
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

    updateSensitivity() {
        const value = parseFloat(this.sensitivitySlider.value);
        console.log('Updating sensitivity to:', value); // 添加调试日志
        this.threshold = 11 - value; // 反转值：滑块值越大，阈值越小，即灵敏度越高
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
        
        // 检测向上运动（完成一次蹲起）
        if (Math.abs(currentY - this.lastY) > this.threshold) {
            this.incrementCounter();
            this.setCooldown();
        }

        this.lastY = currentY;
    }

    incrementCounter() {
        this.counter++;
        this.counterDisplay.textContent = this.counter;
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
    }
}

// 等待 DOM 加载完成后再初始化应用
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM loaded, initializing app...'); // 添加调试日志
    window.squatCounter = new SquatCounter();
});
