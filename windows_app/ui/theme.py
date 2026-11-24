"""Modern dark PySide6 stylesheet tailored for graphic designers."""

DARK_STYLESHEET = """
QWidget {
    background-color: #0B0E14;
    color: #F1F5F9;
    font-family: "Segoe UI", "Plus Jakarta Sans", sans-serif;
    font-size: 13px;
}

QMainWindow, QDialog {
    background-color: #0B0E14;
}

QFrame#Sidebar {
    background-color: #0E121B;
    border-right: 1px solid #1E2636;
}

QFrame#Card {
    background-color: #121722;
    border: 1px solid #1F283A;
    border-radius: 12px;
}

QFrame#StatusBarCard {
    background-color: #121722;
    border: 1px solid #222B3E;
    border-radius: 10px;
}

QPushButton {
    background-color: #182030;
    color: #E2E8F0;
    border: 1px solid #28334A;
    border-radius: 8px;
    padding: 8px 16px;
    font-weight: 600;
}

QPushButton:hover {
    background-color: #202A3F;
    border-color: #3A4969;
}

QPushButton:pressed {
    background-color: #141B29;
}

QPushButton#PrimaryButton {
    background-color: #6366F1;
    color: #FFFFFF;
    border: 1px solid #818CF8;
}

QPushButton#PrimaryButton:hover {
    background-color: #5558E6;
}

QPushButton#NavButton {
    background-color: transparent;
    border: none;
    border-radius: 8px;
    text-align: left;
    padding: 10px 14px;
    color: #94A3B8;
    font-weight: 500;
}

QPushButton#NavButton:hover {
    background-color: #161C29;
    color: #F8FAFC;
}

QPushButton#NavButton[active="true"] {
    background-color: #1E2638;
    color: #FFFFFF;
    font-weight: 600;
}

QLineEdit, QComboBox, QSpinBox {
    background-color: #0E131D;
    color: #F8FAFC;
    border: 1px solid #263147;
    border-radius: 7px;
    padding: 6px 10px;
}

QLineEdit:focus, QComboBox:focus, QSpinBox:focus {
    border-color: #6366F1;
}

QCheckBox {
    spacing: 8px;
    color: #E2E8F0;
}

QSlider::groove:horizontal {
    height: 6px;
    background: #1E2638;
    border-radius: 3px;
}

QSlider::handle:horizontal {
    width: 16px;
    height: 16px;
    margin: -5px 0;
    border-radius: 8px;
    background: #6366F1;
}

QScrollArea {
    border: none;
}

QLabel#MutedLabel {
    color: #94A3B8;
    font-size: 12px;
}

QLabel#SectionTitle {
    font-size: 16px;
    font-weight: 700;
    color: #F8FAFC;
}
"""
