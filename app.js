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
        
        // 动作阈值（放宽条件）
        this.thresholds = {
            standing: {
                yAccel: -7,
                beta: 40
            },
            squatting: {
                yAccel: -4,
                beta: 60
            }
        };
        
        // 时间窗口限制
        this.minActionTime = 600;    // 减少最小时间要求
        this.maxActionTime = 4000;
        this.cooldownTime = 300;     // 减少冷却时间
        
        // 变化检测（降低要求）
        this.lastAccelY = 0;
        this.lastBeta = 0;
        this.minChange = {
            accel: 0.5,  // 降低最小加速度变化要求
            beta: 3.0    // 降低最小角度变化要求
        };
        
        // 音频反馈
        this.audioContext = null;
        this.speechSynthesis = window.speechSynthesis;
        this.speechUtterance = null;
        this.isSpeechInitialized = false;

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
            // 同时初始化语音合成
            if (!this.isSpeechInitialized) {
                this.initSpeechSynthesis();
            }
            document.removeEventListener('click', initAudio);
        };
        document.addEventListener('click', initAudio);
    }

    initSpeechSynthesis() {
        // 创建一个测试用的语音实例
        const testUtterance = new SpeechSynthesisUtterance('');
        testUtterance.lang = 'zh-CN';
        testUtterance.volume = 0; // 设置音量为0，用户听不到
        this.speechSynthesis.speak(testUtterance);
        this.isSpeechInitialized = true;
        console.log('Speech synthesis initialized');
    }

    updateSensitivity() {
        const value = parseFloat(this.sensitivitySlider.value);
        
        // 根据速度调整时间窗口
        this.minActionTime = 800 - value * 50;  // 800ms - 300ms
        this.maxActionTime = 4000;
        this.cooldownTime = 400 - value * 20;   // 400ms - 200ms
        
        // 根据速度调整变化要求
        const factor = value / 5;  // 0.2 - 2.0
        this.minChange = {
            accel: 0.5 * factor,
            beta: 3.0 * factor
        };
        
        // 更新显示
        this.sensitivityValue.textContent = value.toFixed(1);
        
        // 更新速度说明
        let speedDesc = "";
        if (value <= 3) {
            speedDesc = "慢速（适合初学者，动作要慢）";
        } else if (value <= 7) {
            speedDesc = "中速（适合正常练习）";
        } else {
            speedDesc = "快速（适合熟练者，动作要快）";
        }
        
        if (this.isTracking) {
            this.statusDisplay.textContent = `正在计数...（${speedDesc}）`;
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
                thresholds: this.thresholds,
                minChange: this.minChange
            };
            this.debugDisplay.innerHTML = `
                状态: ${stateInfo.state}<br>
                时间: ${stateInfo.timeSince}ms<br>
                加速度Y: ${stateInfo.yAccel}<br>
                角度β: ${stateInfo.beta}°<br>
                最小变化要求: 加速度>${stateInfo.minChange.accel.toFixed(1)}, 角度>${stateInfo.minChange.beta.toFixed(1)}°<br>
                <span style="color: ${Math.abs(stateInfo.yAccel) > stateInfo.minChange.accel || Math.abs(stateInfo.beta) > stateInfo.minChange.beta ? 'green' : 'red'}">
                    变化量: ${Math.abs(stateInfo.yAccel) > stateInfo.minChange.accel || Math.abs(stateInfo.beta) > stateInfo.minChange.beta ? '足够' : '不足'}
                </span>
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
                thresholds: this.thresholds,
                minChange: this.minChange
            };
            this.debugDisplay.innerHTML = `
                状态: ${stateInfo.state}<br>
                时间: ${stateInfo.timeSince}ms<br>
                加速度Y: ${stateInfo.yAccel} (变化: ${stateInfo.accelChange})<br>
                角度β: ${stateInfo.beta}° (变化: ${stateInfo.betaChange}°)<br>
                最小变化要求: 加速度>${stateInfo.minChange.accel.toFixed(1)}, 角度>${stateInfo.minChange.beta.toFixed(1)}°<br>
                <span style="color: ${accelChange > stateInfo.minChange.accel || betaChange > stateInfo.minChange.beta ? 'green' : 'red'}">
                    变化量: ${accelChange > stateInfo.minChange.accel || betaChange > stateInfo.minChange.beta ? '足够' : '不足'}
                </span>
            `;
        }

        // 状态机逻辑（简化条件）
        switch (this.squatState) {
            case 'standing':
                // 检测下蹲开始（只需满足任一条件）
                if (timeSinceLastChange > this.cooldownTime &&
                    ((currentYAccel > this.thresholds.squatting.yAccel && accelChange > this.minChange.accel) ||
                     (avgBeta > this.thresholds.squatting.beta && betaChange > this.minChange.beta))) {
                    this.squatState = 'squatting';
                    this.lastStateChangeTime = now;
                }
                break;

            case 'squatting':
                // 检测起立开始（只需满足任一条件）
                if (timeSinceLastChange > this.minActionTime &&
                    ((currentYAccel < this.thresholds.standing.yAccel && accelChange > this.minChange.accel) ||
                     (avgBeta < this.thresholds.standing.beta && betaChange > this.minChange.beta))) {
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
                    ((currentYAccel >= this.thresholds.standing.yAccel * 0.8 && accelChange > this.minChange.accel) ||
                     (avgBeta <= this.thresholds.standing.beta * 1.2 && betaChange > this.minChange.beta))) {
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

    // 播报数字
    speakNumber(number) {
        // 确保语音已初始化
        if (!this.isSpeechInitialized) {
            this.initSpeechSynthesis();
        }

        // 如果正在播放，先停止
        if (this.speechSynthesis.speaking) {
            this.speechSynthesis.cancel();
        }
        
        // 创建新的语音播报
        this.speechUtterance = new SpeechSynthesisUtterance(number.toString());
        this.speechUtterance.lang = 'zh-CN'; // 设置为中文
        this.speechUtterance.rate = 1.0; // 语速
        this.speechUtterance.pitch = 1.0; // 音高
        this.speechUtterance.volume = 1.0; // 音量
        
        // 开始播放
        this.speechSynthesis.speak(this.speechUtterance);
        console.log('Speaking number:', number);
    }

    incrementCounter() {
        this.counter++;
        this.counterDisplay.textContent = this.counter;
        this.playCountSound();
        this.speakNumber(this.counter); // 添加语音播报
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
