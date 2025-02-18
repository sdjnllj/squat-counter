class SquatCounter {
    constructor() {
        // 状态和计数器
        this.counter = 0;
        this.isTracking = false;
        this.squatState = 'standing'; // 'standing', 'squatting', 'rising'
        this.lastStateChangeTime = 0;
        
        // 运动检测参数
        this.accelerationBuffer = [];
        this.orientationBuffer = [];
        this.bufferSize = 5; // 滑动窗口大小
        
        // 动作阈值（基于数据分析，放宽条件）
        this.thresholds = {
            standing: {
                yAccel: -7,      // 从 -8 改为 -7，放宽站立条件
                beta: 40         // 从 35 改为 40，适应更自然的站姿
            },
            squatting: {
                yAccel: -4,      // 从 -3.5 改为 -4，放宽下蹲条件
                beta: 60         // 从 65 改为 60，降低下蹲角度要求
            }
        };
        
        // 时间窗口限制
        this.minActionTime = 800;   // 从 1000 改为 800，允许更快的动作
        this.maxActionTime = 5000;  // 从 4000 改为 5000，允许更慢的动作
        this.cooldownTime = 300;    // 从 500 改为 300，更快地允许下一个动作
        
        // 音频反馈
        this.audioContext = null;
        this.initAudioContext();

        // DOM 元素
        this.counterDisplay = document.getElementById('counter');
        this.startBtn = document.getElementById('startBtn');
        this.resetBtn = document.getElementById('resetBtn');
        this.statusDisplay = document.getElementById('status');
        this.sensitivitySlider = document.getElementById('sensitivity');
        this.sensitivityValue = document.getElementById('sensitivityValue');
        this.debugDisplay = document.getElementById('debug');

        // 绑定事件处理器
        this.startBtn.addEventListener('click', () => this.toggleTracking());
        this.resetBtn.addEventListener('click', () => this.reset());
        this.sensitivitySlider.addEventListener('input', (e) => this.updateSensitivity());

        // 初始化传感器
        this.initializeSensors();
        this.updateSensitivity();
    }

    async initializeSensors() {
        try {
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

            window.addEventListener('devicemotion', (event) => this.handleMotion(event));
            window.addEventListener('deviceorientation', (event) => this.handleOrientation(event));
            
            this.statusDisplay.textContent = '准备就绪';
        } catch (error) {
            console.error('Error initializing sensors:', error);
            this.statusDisplay.textContent = '初始化传感器失败: ' + error.message;
            this.startBtn.disabled = true;
        }
    }

    initAudioContext() {
        const initAudio = () => {
            if (!this.audioContext) {
                this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            }
            document.removeEventListener('click', initAudio);
        };
        document.addEventListener('click', initAudio);
    }

    updateSensitivity() {
        const value = parseFloat(this.sensitivitySlider.value);
        // 根据速度设置调整时间窗口
        this.minActionTime = 1500 - value * 150; // 从 2000 改为 1500，整体提速
        this.maxActionTime = 5000 - value * 300; // 调整最大时间范围
        this.sensitivityValue.textContent = value.toFixed(1);
        
        if (this.isTracking) {
            this.statusDisplay.textContent = `正在计数...（速度：${value.toFixed(1)}）`;
        }
    }

    handleMotion(event) {
        if (!this.isTracking) return;

        const acceleration = event.accelerationIncludingGravity;
        if (!acceleration) return;

        // 更新加速度缓冲区
        this.accelerationBuffer.push({
            y: acceleration.y
        });
        if (this.accelerationBuffer.length > this.bufferSize) {
            this.accelerationBuffer.shift();
        }

        // 计算平均Y轴加速度
        const avgYAccel = this.accelerationBuffer.reduce((sum, acc) => sum + acc.y, 0) / this.accelerationBuffer.length;
        
        this.updateState(avgYAccel);
    }

    handleOrientation(event) {
        if (!this.isTracking) return;

        // 更新方向缓冲区
        this.orientationBuffer.push({
            beta: event.beta
        });
        if (this.orientationBuffer.length > this.bufferSize) {
            this.orientationBuffer.shift();
        }

        // 计算平均Beta角度
        const avgBeta = this.orientationBuffer.reduce((sum, ori) => sum + ori.beta, 0) / this.orientationBuffer.length;
        
        if (this.debugDisplay) {
            const stateInfo = {
                state: this.squatState,
                timeSince: Date.now() - this.lastStateChangeTime,
                yAccel: this.accelerationBuffer.length > 0 ? this.accelerationBuffer[this.accelerationBuffer.length - 1].y.toFixed(2) : 'N/A',
                beta: avgBeta.toFixed(1),
                thresholds: {
                    standing: this.thresholds.standing,
                    squatting: this.thresholds.squatting
                }
            };
            this.debugDisplay.innerHTML = `
                状态: ${stateInfo.state}<br>
                时间: ${stateInfo.timeSince}ms<br>
                加速度Y: ${stateInfo.yAccel}<br>
                角度β: ${stateInfo.beta}°<br>
                站立阈值: Y=${stateInfo.thresholds.standing.yAccel}, β=${stateInfo.thresholds.standing.beta}°<br>
                下蹲阈值: Y=${stateInfo.thresholds.squatting.yAccel}, β=${stateInfo.thresholds.squatting.beta}°
            `;
        }
    }

    updateState(currentYAccel) {
        const now = Date.now();
        const timeSinceLastChange = now - this.lastStateChangeTime;
        
        // 获取当前平均Beta角度
        const avgBeta = this.orientationBuffer.length > 0 ?
            this.orientationBuffer.reduce((sum, ori) => sum + ori.beta, 0) / this.orientationBuffer.length :
            0;

        // 增加调试信息
        if (this.debugDisplay) {
            const stateInfo = {
                state: this.squatState,
                timeSince: timeSinceLastChange,
                yAccel: currentYAccel.toFixed(2),
                beta: avgBeta.toFixed(1),
                thresholds: {
                    standing: this.thresholds.standing,
                    squatting: this.thresholds.squatting
                }
            };
            this.debugDisplay.innerHTML = `
                状态: ${stateInfo.state}<br>
                时间: ${stateInfo.timeSince}ms<br>
                加速度Y: ${stateInfo.yAccel}<br>
                角度β: ${stateInfo.beta}°<br>
                站立阈值: Y=${stateInfo.thresholds.standing.yAccel}, β=${stateInfo.thresholds.standing.beta}°<br>
                下蹲阈值: Y=${stateInfo.thresholds.squatting.yAccel}, β=${stateInfo.thresholds.squatting.beta}°
            `;
        }

        // 状态机逻辑
        switch (this.squatState) {
            case 'standing':
                // 检测下蹲开始（放宽条件）
                if (timeSinceLastChange > this.cooldownTime &&
                    currentYAccel > this.thresholds.squatting.yAccel * 0.9 && // 增加 10% 容差
                    avgBeta > this.thresholds.squatting.beta * 0.9) {        // 增加 10% 容差
                    this.squatState = 'squatting';
                    this.lastStateChangeTime = now;
                }
                break;

            case 'squatting':
                // 检测起立开始（放宽条件）
                if (timeSinceLastChange > this.minActionTime &&
                    (currentYAccel < this.thresholds.standing.yAccel * 1.1 || // 增加 10% 容差
                     avgBeta < this.thresholds.standing.beta * 1.1)) {        // 增加 10% 容差
                    this.squatState = 'rising';
                    this.lastStateChangeTime = now;
                }
                // 如果蹲得太久，重置状态
                else if (timeSinceLastChange > this.maxActionTime) {
                    this.squatState = 'standing';
                    this.lastStateChangeTime = now;
                }
                break;

            case 'rising':
                // 完成一次蹲起（放宽条件）
                if (timeSinceLastChange > this.cooldownTime &&
                    ((currentYAccel >= this.thresholds.standing.yAccel * 0.7 && // 增加更大容差
                      avgBeta <= this.thresholds.standing.beta * 1.3) ||       // 增加更大容差
                     (timeSinceLastChange > this.minActionTime * 1.5))) {      // 添加基于时间的备选条件
                    this.squatState = 'standing';
                    this.lastStateChangeTime = now;
                    this.incrementCounter();
                }
                // 如果起立时间太长，重置状态
                else if (timeSinceLastChange > this.maxActionTime) {
                    this.squatState = 'standing';
                    this.lastStateChangeTime = now;
                }
                break;
        }
    }

    playCountSound() {
        if (!this.audioContext) return;

        const oscillator = this.audioContext.createOscillator();
        const gainNode = this.audioContext.createGain();
        
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(880, this.audioContext.currentTime);
        
        gainNode.gain.setValueAtTime(0, this.audioContext.currentTime);
        gainNode.gain.linearRampToValueAtTime(0.3, this.audioContext.currentTime + 0.01);
        gainNode.gain.linearRampToValueAtTime(0, this.audioContext.currentTime + 0.15);
        
        oscillator.connect(gainNode);
        gainNode.connect(this.audioContext.destination);
        
        oscillator.start();
        oscillator.stop(this.audioContext.currentTime + 0.15);
    }

    incrementCounter() {
        this.counter++;
        this.counterDisplay.textContent = this.counter;
        this.playCountSound();
        this.counterDisplay.style.transform = 'scale(1.2)';
        setTimeout(() => {
            this.counterDisplay.style.transform = 'scale(1)';
        }, 200);
    }

    toggleTracking() {
        this.isTracking = !this.isTracking;
        this.startBtn.textContent = this.isTracking ? '暂停' : '开始';
        const sensitivity = parseFloat(this.sensitivitySlider.value).toFixed(1);
        this.statusDisplay.textContent = this.isTracking ? 
            `正在计数...（速度：${sensitivity}）` : '已暂停';
        
        if (this.isTracking) {
            this.startBtn.style.backgroundColor = '#dc3545';
            this.accelerationBuffer = [];
            this.orientationBuffer = [];
            this.squatState = 'standing';
            this.lastStateChangeTime = Date.now();
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
        this.accelerationBuffer = [];
        this.orientationBuffer = [];
        this.squatState = 'standing';
        this.lastStateChangeTime = Date.now();
    }
}

// 等待 DOM 加载完成后再初始化应用
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM loaded, initializing app...');
    window.squatCounter = new SquatCounter();
});
