/*
 * @Author: 陈力恒
 * @Date: 2026-07-30 03:03:24
 * @LastEditors: 陈力恒
 * @LastEditTime: 2026-07-30 20:09:34
 * @Description: file content
 */
import type { Patient } from "../../api/patient";
import { MaterialIcon } from "../../components/MaterialIcon";

type ConsultationOfferCardProps = {
  patient: Patient | null;
  disabled: boolean;
  onSwitchPatient: () => void;
  onStart: () => void;
  onContinue: () => void;
};

/** 症状识别后的显式问诊确认，不在用户确认前调用普通模型或改变问诊状态。 */
export function ConsultationOfferCard({
  patient,
  disabled,
  onSwitchPatient,
  onStart,
  onContinue,
}: ConsultationOfferCardProps) {
  return (
    <section className="consultation-offer-card" aria-label="是否开始问诊">
      <header>
        <span aria-hidden="true">
          <MaterialIcon name="medicalServices" />
        </span>
        <div>
          <strong>建议开始问诊</strong>
          <p>我会按步骤采集症状，并在完成后生成问诊记录。</p>
        </div>
      </header>

      <button
        type="button"
        className="consultation-offer-patient"
        onClick={onSwitchPatient}
        disabled={disabled}
        aria-label={
          patient ? `切换问诊患者，当前${patient.name}` : "选择问诊患者"
        }
      >
        <span>
          <small>当前患者</small>
          <strong>{patient?.name ?? "尚未选择患者"}</strong>
        </span>
        <span>
          {patient ? "切换" : "选择"}
          <MaterialIcon name="chevronRight" />
        </span>
      </button>

      <footer>
        <button
          type="button"
          className="consultation-offer-secondary"
          onClick={onContinue}
          disabled={disabled}
        >
          继续对话
        </button>
        <button
          type="button"
          className="consultation-offer-primary"
          onClick={patient ? onStart : onSwitchPatient}
          disabled={disabled}
        >
          {patient ? "开始问诊" : "选择患者"}
        </button>
      </footer>
    </section>
  );
}
