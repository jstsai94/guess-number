/**
 * 應用進入點。
 *
 * 只負責找到掛載點並交給 UI 層，不持有任何遊戲狀態。
 */
import './ui/styles.css';
import { mountApp } from './ui/mountApp';

const root = document.querySelector<HTMLDivElement>('#app');
if (!root) throw new Error('找不到 #app 掛載點');

mountApp(root);
