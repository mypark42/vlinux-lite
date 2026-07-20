import mitt from "mitt";

type Events = {
    FOCUS: {
        objectKey: string
    };
    PICK: {
        pKey: number
        objectKey: string
    }
};

export const eventBus = mitt<Events>();
