package Interface;

public interface Menu {
    void chooseAction() throws InterruptedException;
    void incorrectInput() throws InterruptedException;
    void startGame() throws InterruptedException;
    void exitGame() throws InterruptedException;
}
