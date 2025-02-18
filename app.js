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
        
        // 动作阈值（更严格的条件）
        this.thresholds = {
            standing: {
                yAccel: -7,      // 改回更严格的值
                beta: 40         // 保持适中的角度要求
            },
            squatting: {
                yAccel: -4,      // 改回更严格的值
                beta: 60         // 保持适中的角度要求
            }
        };
        
        // 时间窗口限制
        this.minActionTime = 800;   // 改回更合理的最小时间
        this.maxActionTime = 4000;  // 改回更合理的最大时间
        this.cooldownTime = 500;    // 增加冷却时间防止误判
        
        // 添加变化检测
        this.lastAccelY = 0;
        this.lastBeta = 0;
        this.minChange = {
            accel: 1.0,  // 最小加速度变化
            beta: 5.0    // 最小角度变化
        };
        
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
        this.minActionTime = 1500 - value * 100; // 调整时间范围
        this.maxActionTime = 4000 - value * 200; // 调整时间范围
        
        // 根据速度调整最小变化要求
        this.minChange = {
            accel: 1.0 + (value * 0.2),  // 1.2 - 3.0
            beta: 5.0 + (value * 0.5)     // 5.5 - 10.0
        };
        
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
                站立阈值: Y=${stateInfo.thresholds.standing.yAccel.toFixed(2)}, β=${stateInfo.thresholds.standing.beta}°<br>
                下蹲阈值: Y=${stateInfo.thresholds.squatting.yAccel.toFixed(2)}, β=${stateInfo.thresholds.squatting.beta}°
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

        // 计算变化量
        const accelChange = Math.abs(currentYAccel - this.lastAccelY);
        const betaChange = Math.abs(avgBeta - this.lastBeta);
        
        // 更新历史值
        this.lastAccelY = currentYAccel;
        this.lastBeta = avgBeta;

        // 增加调试信息
        if (this.debugDisplay) {
            const stateInfo = {
                state: this.squatState,
                timeSince: timeSinceLastChange,
                yAccel: currentYAccel.toFixed(2),
                beta: avgBeta.toFixed(1),
                accelChange: accelChange.toFixed(2),
                betaChange: betaChange.toFixed(1),
                thresholds: {
                    standing: this.thresholds.standing,
                    squatting: this.thresholds.squatting
                },
                minChange: this.minChange
            };
            this.debugDisplay.innerHTML = `
                状态: ${stateInfo.state}<br>
                时间: ${stateInfo.timeSince}ms<br>
                加速度Y: ${stateInfo.yAccel} (变化: ${stateInfo.accelChange})<br>
                角度β: ${stateInfo.beta}° (变化: ${stateInfo.betaChange}°)<br>
                站立阈值: Y=${stateInfo.thresholds.standing.yAccel.toFixed(2)}, β=${stateInfo.thresholds.standing.beta}°<br>
                下蹲阈值: Y=${stateInfo.thresholds.squatting.yAccel.toFixed(2)}, β=${stateInfo.thresholds.squatting.beta}°<br>
                最小变化: 加速度=${stateInfo.minChange.accel.toFixed(1)}, 角度=${stateInfo.minChange.beta.toFixed(1)}°
            `;
        }

        // 状态机逻辑
        switch (this.squatState) {
            case 'standing':
                // 检测下蹲开始（需要满足变化量要求）
                if (timeSinceLastChange > this.cooldownTime &&
                    currentYAccel > this.thresholds.squatting.yAccel &&
                    avgBeta > this.thresholds.squatting.beta &&
                    (accelChange > this.minChange.accel || betaChange > this.minChange.beta)) {
                    this.squatState = 'squatting';
                    this.lastStateChangeTime = now;
                }
                break;

            case 'squatting':
                // 检测起立开始（需要满足变化量要求）
                if (timeSinceLastChange > this.minActionTime &&
                    currentYAccel < this.thresholds.standing.yAccel &&
                    avgBeta < this.thresholds.standing.beta &&
                    (accelChange > this.minChange.accel || betaChange > this.minChange.beta)) {
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
                // 完成一次蹲起（需要满足变化量要求）
                if (timeSinceLastChange > this.cooldownTime &&
                    currentYAccel >= this.thresholds.standing.yAccel * 0.9 &&
                    avgBeta <= this.thresholds.standing.beta * 1.1 &&
                    (accelChange > this.minChange.accel || betaChange > this.minChange.beta)) {
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
